define(['require',
  'modules/Vent',
  'utils/LangSupport',
  'utils/Utils',
  'utils/Globals',
  'modules/Modal',
  'hbs!tmpl/topology/dataStreamMaster',
  'models/VTopology',
  'modules/TopologyGraphCreatorViaRect',
  'x-editable',
], function(require, Vent, localization, Utils, Globals, Modal, tmpl, VTopology, TopologyGraphCreator, xEditable) {
  'use strict';

  var TopologyEditorLayout = Marionette.LayoutView.extend({

    template: tmpl,
    templateHelpers: function(){
      return {
        topologyName: this.topologyName
      };
    },

    events: {
      'click #submitTopology'   : 'evSubmitAction',
      'click #deployTopology'   : 'evDeployAction',
      'click #killTopology'     : 'evKillAction',
      'click #configTopology'   : 'evConfigAction'
    },

    ui: {
      'btnDS'         : '#btnDS',
      'btnProcessor'  : '#btnProcessor',
      'btnDataSink'   : '#btnDataSink',
      'editorSubMenu' : '#editorSubhead',
      'graphEditor'   : '#graphEditor'
    },

    initialize: function(options) {
      _.extend(this, options);
      this.initializeVariables();
      this.vent = Vent;
      this.topologyConfigModel = new Backbone.Model({
        rootdir: '', parserPath: '', notifierPath: ''
      });
      if(!this.model){
        this.model = new VTopology();
        this.topologyName = 'Topology-Name';
      } else {
        this.topologyId = this.model.get('id');
        this.topologyName = this.model.get('name');
        this.model.set('_editState', true);
        this.model.set('config', JSON.parse(this.model.get('config')));
        this.setTopologyConfigModel();
      }
      this.getAllConfigurations();
      if(this.model.get('_editState')){
        this.updateVariables();
        this.getMetaInfo();
      }
      this.bindEvents();
    },

    setTopologyConfigModel: function(){
      var config = this.model.get('config').config,
      obj = {
        rootdir: config.hbaseConf['hbase.rootdir'],
        parserPath: config['local.parser.jar.path'],
        notifierPath: config['local.notifier.jar.path']
      };
      this.topologyConfigModel.set(obj);
    },

    initializeVariables: function(){
      this.dsCount = 0;
      this.pCount = 0;
      this.sCount = 0;
      this.dsArr = [];
      this.processorArr = [];
      this.sinkArr = [];
      this.linkArr = [];
      this.graphNodesData = { source : [], processor: [], sink: [] };
    },

    updateVariables: function(){
      var config = this.model.get('config'),
        self = this;
      this.dsCount = config.dataSources.length;
      this.pCount = config.processors.length;
      this.sCount = config.dataSinks.length;

      _.each(config.dataSources, function(obj, i){
        var model = new Backbone.Model({_nodeId: i, firstTime: false, currentType: 'DEVICE', uiname: obj.uiname});
        self.setHiddenConfigFields(model, _.findWhere(self.sourceConfigArr, {subType: 'KAFKA'}));
        self.setAdditionalData(model.attributes, obj.config);
        self.dsArr.push(model.toJSON());
        var t_obj = _.findWhere(Globals.Topology.Editor.Steps.Datasource.Substeps, {valStr: 'DEVICE'});
        self.graphNodesData.source.push(_.extend(JSON.parse(JSON.stringify(t_obj)), {uiname: obj.uiname, nodeId: i, currentType: 'DEVICE'}));
      });

      _.each(config.processors, function(obj, i){
        var model = new Backbone.Model({_nodeId: i, firstTime: false, currentType: obj.type, uiname: obj.uiname});
        self.setHiddenConfigFields(model, _.findWhere(self.processorConfigArr, {subType: obj.type}));
        self.setAdditionalData(model.attributes, obj.config);
        if(obj.type === 'PARSER'){
          self.dsArr[0]._selectedTable = [{
            dataSourceId : model.get('dataSourceId'),
            parserId : model.get('parserId')
          }];
        }
        self.processorArr.push(model.toJSON());
        var t_obj = _.findWhere(Globals.Topology.Editor.Steps.Processor.Substeps, {valStr: obj.type});
        self.graphNodesData.processor.push(_.extend(JSON.parse(JSON.stringify(t_obj)), {uiname: obj.uiname, nodeId: i, currentType: obj.type}));
      });
      
      _.each(config.dataSinks, function(obj, i){
        var model = new Backbone.Model({_nodeId: i, firstTime: false, currentType: obj.type, uiname: obj.uiname});
        self.setHiddenConfigFields(model, _.findWhere(self.sinkConfigArr, {subType: obj.type}));
        self.setAdditionalData(model.attributes, obj.config);
        self.sinkArr.push(model.toJSON());
        var t_obj = _.findWhere(Globals.Topology.Editor.Steps.DataSink.Substeps, {valStr: obj.type});
        self.graphNodesData.sink.push(_.extend(JSON.parse(JSON.stringify(t_obj)), {uiname: obj.uiname, nodeId: i, currentType: obj.type}));
      });
    },

    getMetaInfo: function(){
      var self = this;
      this.model.getMetaInfo({
        id: this.model.get('id'),
        async: false,
        success: function(model, response, options){
          self.linkArr = JSON.parse(model.entity.data);
        },
        error: function(model, response, options){
          Utils.showError(model, response);
        }
      });
    },

    setAdditionalData: function(sourceObj, newData){
      for(var key in newData){
        sourceObj[key] = newData[key];
      }
      return sourceObj;
    },

    configSortComparator:function(a,b) {
        if ( a.isOptional < b.isOptional )
            return -1;
        if ( a.isOptional > b.isOptional )
            return 1;
        return 0;
    },

    getAllConfigurations: function(){
      var self = this;
      this.sourceConfigArr = [];
      this.processorConfigArr = [];
      this.sinkConfigArr = [];
      this.linkConfigArr = [];

      this.model.getSourceComponent({
        async: false,
        success: function(model, response, options){
          self.sourceConfigArr = model.entities;
        },
        error: function(model, response, options){
          Utils.notifyError('Source Component Configurations '+options);
        }
      });

      this.model.getProcessorComponent({
        async: false,
        success: function(model, response, options){
          self.processorConfigArr = model.entities;
        },
        error: function(model, response, options){
          Utils.notifyError('Processor Component Configurations '+options);
        }
      });
      
      this.model.getSinkComponent({
        async: false,
        success: function(model, response, options){
          self.sinkConfigArr = model.entities;
        },
        error: function(model, response, options){
          Utils.notifyError('Sink Component Configurations '+options);
        }
      });

      this.model.getLinkComponent({
        async: false,
        success: function(model, response, options){
          self.linkConfigArr = model.entities;
        },
        error: function(model, response, options){
          Utils.notifyError('Link Component Configurations '+options);
        }
      });
    },

    bindEvents: function(){
      var self = this;
      
      this.listenTo(this.vent, 'topologyEditor:SaveDeviceSource', function(data){
        self.dsArr[data.get('_nodeId')] = data.toJSON();
      });
      
      this.listenTo(this.vent, 'topologyEditor:SaveProcessor', function(data){
        self.processorArr[data.get('_nodeId')] = data.toJSON();
      });
      
      this.listenTo(this.vent, 'topologyEditor:SaveSink', function(data){
        self.syncSinkData(data);
        self.sinkArr[data.get('_nodeId')] = data.toJSON();
      });

      this.listenTo(this.vent, 'click:topologyNode', function(data){
        if(!_.isString(data.nodeId) || !data.nodeId.startsWith('Parser')){
          var model = new Backbone.Model();
          var nodeId = data.nodeId;
          var obj = {
            _nodeId: nodeId,
            firstTime: true,
            uiname: data.currentType,
            currentType: data.currentType
          };
          switch(data.parentType){
            //Source
            case Globals.Topology.Editor.Steps.Datasource.valStr:
              if(this.dsArr[nodeId]){
                model.set(this.dsArr[nodeId]);
              } else {
                model.set(obj);
                self.setHiddenConfigFields(model, _.findWhere(this.sourceConfigArr, {subType: 'KAFKA'}));
              }
              self.evDSAction(model);
            break;

            //Processor
            case Globals.Topology.Editor.Steps.Processor.valStr:
              if(this.processorArr[nodeId]){
                model.set(this.processorArr[nodeId]);
              } else {
                model.set(obj);
                if(_.isEqual(data.currentType, "PARSER")){
                  self.setHiddenConfigFields(model, _.findWhere(this.processorConfigArr, {subType: 'PARSER'}));
                } else if(_.isEqual(data.currentType, "RULE")){
                  self.setHiddenConfigFields(model, _.findWhere(this.processorConfigArr, {subType: 'RULE'}));
                }
              }
              if(this.verifyLink(model.get('currentType'), model.get('_nodeId'))){
                self.evProcessorAction(model);
              }
            break;

            //Sink
            case Globals.Topology.Editor.Steps.DataSink.valStr:
              if(this.sinkArr[nodeId]){
                model.set(this.sinkArr[nodeId]);
              } else {
                model.set(obj);
                self.setHiddenConfigFields(model, _.findWhere(this.sinkConfigArr, {subType: data.currentType}));
              }
              if(this.verifyLink(model.get('currentType'), model.get('_nodeId'))){
                self.evDataSinkAction(model, data.currentType);
              }
            break;
          }
        }
      });
      
      this.listenTo(this.vent, 'topologyEditor:SaveConfig', function(configData){
        self.topologyConfigModel = configData;
      });

      this.listenTo(this.vent, 'topologyLink', function(linkArr){
        self.linkArr = linkArr;
      });
    },

    verifyLink: function(type, nodeId){
      var obj = this.linkArr.filter(function(obj){
        return (obj.target.currentType === type && obj.target.nodeId === nodeId);
      });
      if(!obj.length){
        Utils.notifyError('Connect the node to configre.');
        return false;
      }
      return true;
    },

    setHiddenConfigFields: function(model, obj){
      if(obj){
        var configFields = JSON.parse(obj.config);
        var hiddenFields = {
          type: obj.subType,
          transformationClass: obj.transformationClass
        };
        model.set('hiddenFields', hiddenFields);
        model.set('config', configFields);
      }
    },

    onRender:function(){
      this.$el.find('#loading').addClass('loader');
      var self = this;
      this.setTopologyName();
      this.bindSubMenuDrag();
      setTimeout(function(){
        self.graphData = self.syncGraphData();
        self.renderGraphGenerator();
        self.$('#graphEditor svg').droppable({
            drop: function(event, ui){
              var mainmenu  = ui.helper.data().mainmenu,
                  submenu = ui.helper.data().submenu,
                  obj = _.findWhere(Globals.Topology.Editor.Steps[mainmenu].Substeps, {valStr:submenu}),
                  id, otherId;
              switch(mainmenu){
                case Globals.Topology.Editor.Steps.Datasource.valStr:
                  id = self.dsCount++;
                  self.dsArr[id] = undefined;
                  otherId = self.pCount++;
                  self.processorArr[otherId] = undefined;
                break;

                case Globals.Topology.Editor.Steps.Processor.valStr:
                  id = self.pCount++;
                  self.processorArr[id] = undefined;
                break;

                case Globals.Topology.Editor.Steps.DataSink.valStr:
                  id = self.sCount++;
                  self.sinkArr[id] = undefined;
                break;
              }

              self.vent.trigger('change:editor-submenu', {
                nodeObj: obj,
                id: id,
                otherId: otherId,
                event: event
              });
            }
        });
      }, 0);
      // setTimeout(function(){
        if(self.model.has('id')){
          self.$('#deployTopology').removeAttr('disabled');
        }
        self.$('[data-rel="tooltip"]').tooltip({placement: 'bottom'});
        self.$el.find('#loading').removeClass('loader');
      // }, 0);
    },

    setTopologyName: function(){
      var self = this;
      this.$('#topologyName').editable({
          mode:'inline',
          validate: function(value) {
           if(_.isEqual($.trim(value), '')) return 'Name is required';
        }
      });

      this.$('.editable').on('save', function(e, params) {
        self.topologyName = params.newValue;
      });

      this.$('.editable').on('rendered', function(e){
        $(e.currentTarget).append("<i class='fa fa-pencil'></i>");
      });
    },

    syncGraphData: function(){
      var self = this;
      var nodes = [],
          edges = [];
      if(this.model.get('_editState')){
        Array.prototype.push.apply(nodes, this.graphNodesData.source);
        Array.prototype.push.apply(nodes, this.graphNodesData.processor);
        Array.prototype.push.apply(nodes, this.graphNodesData.sink);
        
        var tempArr = [];
        _.each(this.linkArr, function(obj){
          tempArr.push(obj.source);
          tempArr.push(obj.target);
        });
        
        var newArr = [];
        _.each(nodes, function(object, i){
          var tempObj = _.findWhere(tempArr, {uniqueName: object.currentType+'-'+object.nodeId});
          newArr.push({
            x: _.isUndefined(tempObj) ? -800 : tempObj.x,
            y: _.isUndefined(tempObj) ? -300 : tempObj.y,
            uniqueName: tempObj.uniqueName,
            parentType: tempObj.parentType,
            currentType: tempObj.currentType,
            imageURL: tempObj.imageURL,
            id: tempObj.id,
            nodeId: tempObj.nodeId,
            streamId: _.isUndefined(tempObj.streamId) ? undefined : tempObj.streamId
          });
        });
        nodes = newArr;

        _.each(this.linkArr, function(obj){
          obj.source = _.findWhere(newArr, {uniqueName: obj.source.uniqueName});
          obj.target = _.findWhere(newArr, {uniqueName: obj.target.uniqueName});
        });

        edges = this.linkArr;
      }
      return {nodes: nodes, edges: edges};
    },

    renderGraphGenerator: function(){
      var self = this,
          data = this.graphData;
      var graph = new TopologyGraphCreator({
        elem: this.ui.graphEditor,
        data: data,
        vent: this.vent
      });
      graph.updateGraph();
    },

    bindSubMenuDrag: function(){
      this.$('.panel-body img').draggable({
        revert: "invalid",
        helper: function (e) {
            return $(e.currentTarget).clone();
        }
      });
    },

    evDSAction: function(model){
      if(model.has('config')){
        model.get('config').sort(this.configSortComparator);
      }
      var self = this;
      var obj = {
        iconClass: Globals.Topology.Editor.Steps.Datasource.iconClass,
        titleHtmlFlag: true,
        titleName: model.get('uiname')
      };
      require(['views/topology/DataFeedView'], function(DataFeedView){
        self.showModal(new DataFeedView({
          model: model,
          vent: self.vent
        }), obj);
      });
    },

    evProcessorAction: function(model){
      var self = this;
      var obj = {
        iconClass: Globals.Topology.Editor.Steps.Processor.iconClass,
        titleHtmlFlag: true,
        titleName: model.get('uiname'),
        type: Globals.Topology.Editor.Steps.Processor.valStr
      };
      switch(model.get('currentType')){
        case 'PARSER':
          if(this.syncParserData(model)){
            require(['views/topology/ParserProcessorView'], function(ParserProcessorView){
              self.showModal(new ParserProcessorView({
                model: model,
                vent: self.vent
              }), obj);
            });
          }
        break;

        case 'RULE':
          if(this.syncRuleData(model)){
            require(['views/topology/RuleProcessorView'], function(RuleProcessorView){
              self.showModal(new RuleProcessorView({
                model: model,
                vent: self.vent
              }), obj);
            });
          }
        break;
      }
    },

    evDataSinkAction: function(model, type){
      if(model.has('config')){
        model.get('config').sort(this.configSortComparator);
      }
      var self = this;
      var obj = {
        iconClass: Globals.Topology.Editor.Steps.DataSink.iconClass,
        titleHtmlFlag: true,
        titleName: model.get('uiname')
      };
      if(this.syncSinkData(model, true)){
        require(['views/topology/DataSinkView'], function(DataSinkView){
          self.showModal(new DataSinkView({
            model: model,
            vent: self.vent,
            type: type
          }), obj);
        });
      }
    },

    syncParserData: function(model){
      var obj = this.linkArr.filter(function(obj){
        return (obj.target.currentType === 'PARSER' && obj.target.nodeId === model.get('_nodeId'));
      });
      if(obj.length){
        var sourceData = this.dsArr[obj[0].source.nodeId];
        if(!sourceData){
          Utils.notifyError("Configure the connected source node first.");
          return false;
        } else {
          if(!model.has('parserId')) model.set('parserId', sourceData._selectedTable[0].parserId);
          if(!model.has('dataSourceId')) model.set('dataSourceId', sourceData._selectedTable[0].datasourceId);
          if(!model.has('parserName')) model.set('parserName', (sourceData._selectedTable) ? sourceData._selectedTable[0].parserName : '');
          if(!model.has('dataSourceName')) model.set('dataSourceName', (sourceData._selectedTable) ? sourceData._selectedTable[0].datasourceName : '');
          if(!model.has('parallelism')){
            model.set('parallelism', 1);
          }
          return true;
        }
      }
    },

    syncRuleData: function(model){
      var obj = this.linkArr.filter(function(obj){
        return (obj.target.currentType === 'RULE' && obj.target.nodeId === model.get('_nodeId'));
      });
      if(obj.length){
        var sourceData = this.processorArr[obj[0].source.nodeId];
        if(!sourceData){
          Utils.notifyError("Configure the connected node first.");
          return false;
        } else {
          model.set('parserId', sourceData.parserId);
          model.set('dataSourceId', sourceData.dataSourceId);
          if(model.has('rulesProcessorConfig')){
            var object = {
              "rulesProcessorConfig" : model.get('rulesProcessorConfig')
            };
            if(!model.has('newConfig')) model.set('newConfig', object);
          }
          return true;
        }
      }
    },

    syncSinkData: function(model, validationFlag){
      var obj = this.linkArr.filter(function(obj){
        return (obj.target.parentType === 'DataSink' && obj.target.nodeId === model.get('_nodeId'));
      });
      if(obj.length){
        if(obj[0].source.parentType === 'Processor'){
          var sourceData = this.processorArr[obj[0].source.nodeId];
          if(!sourceData){
            Utils.notifyError("Configure the connected node first.");
            return false;
          }

          if(obj[0].source.currentType === 'RULE' && !validationFlag){
            var rulesDataConfig = _.isUndefined(sourceData.newConfig) ? sourceData.rulesProcessorConfig : sourceData.newConfig.rulesProcessorConfig;
            rulesDataConfig.rules[0].action.components = [{
              name: model.get('uiname'),
              id: new Date().getTime(),
              description: 'Auto-Generated For '+model.get('uiname'),
              declaredInput: rulesDataConfig.declaredInput
            }];
          }
          return true;
        }
      }
    },

    showModal: function(view, object){
      var self = this,
          titleHtml;
      if(this.view){
        return;
      }
      if(object.titleHtmlFlag){
        titleHtml = '<a href="javascript:void(0)" id="editableTitle" data-type="text"> '+object.titleName+'<i class="fa fa-pencil"></i></a>';
      }
      this.view = view;
      var modal = new Modal({
        title: titleHtml,
        titleHtml: object.titleHtmlFlag,
        contentWithFooter: true,
        content: self.view,
        showFooter: false,
        escape: false,
        mainClass: _.isEqual(object.type, Globals.Topology.Editor.Steps.Processor.valStr) ? 'modal-lg' : ''
      }).open();

      modal.$('#editableTitle').editable({
          mode:'inline',
          validate: function(value) {
           if(_.isEqual($.trim(value), '')) return 'Name is required';
        }
      });

      modal.$('.editable').on('save', function(e, params) {
        modal.options.content.model.set('uiname', params.newValue);
      });

      modal.$('.editable').on('rendered', function(e){
        $(e.currentTarget).append("<i class='fa fa-pencil'></i>");
      });

      this.view.on('closeModal', function(){
        self.view = null;
        modal.trigger('cancel');
      });
    },

    evSubmitAction: function(e){
      this.$el.find('#loading').addClass('loader');
      var self = this,
          ds = [],
          processors = [],
          sink = [],
          links = [],
          topologyConfig = {
            "hbaseConf": {
              "hbase.rootdir": this.topologyConfigModel.get('rootdir')
            },
            "local.parser.jar.path": this.topologyConfigModel.get('parserPath'),
            "local.notifier.jar.path": this.topologyConfigModel.get('notifierPath')
          };
      var tempData = {
        config: topologyConfig,
        dataSources: [],
        processors: [],
        dataSinks: [],
        links: []
      };

      if(_.isEqual(this.dsArr.length, this.dsCount)){
        _.each(this.dsArr, function(obj){
          if(obj){
            var configObj = {};
            _.each(obj.config, function(o){
              if(obj[o.name]){
                configObj[o.name] = obj[o.name];
              }
            });
            ds.push({
              "uiname": obj.uiname,
              "type": obj.hiddenFields ? obj.hiddenFields.type : '',
              "transformationClass": obj.hiddenFields ? obj.hiddenFields.transformationClass : '',
              "config": configObj
            });
          }
        });
        tempData.dataSources = ds;
      } else {
        self.$el.find('#loading').removeClass('loader');
        Utils.notifyError('There are some unconfigured nodes present. Kindly configure to proceed.');
        return false;
      }
      if(_.isEqual(this.processorArr.length, this.pCount)){
        _.each(this.processorArr, function(obj){
          if(obj){
            if(obj.hiddenFields.type === 'PARSER'){
              processors.push({
                "uiname": obj.uiname,
                "type": obj.hiddenFields ? obj.hiddenFields.type : '',
                "transformationClass": obj.hiddenFields ? obj.hiddenFields.transformationClass : '',
                "config": {
                  "parsedTuplesStream": "parsedTuplesStream",
                  "failedTuplesStream": "failedTuplesStream",
                  "parserId": 1,
                  "dataSourceId": 1,
                  "parallelism": 1
                }
              });
            } else if(obj.hiddenFields.type === 'RULE'){

              processors.push({
                "uiname": obj.uiname,
                "type": obj.hiddenFields ? obj.hiddenFields.type : '',
                "transformationClass": obj.hiddenFields ? obj.hiddenFields.transformationClass : '',
                "config": obj.newConfig ? obj.newConfig : {parallelism: obj.parallelism, rulesProcessorConfig: obj.rulesProcessorConfig}
              });
            }
          }
        });
        tempData.processors = processors;
      } else {
        self.$el.find('#loading').removeClass('loader');
        Utils.notifyError('There are some unconfigured nodes present. Kindly configure to proceed.');
        return false;
      }
      if(_.isEqual(this.sinkArr.length, this.sCount)){
        _.each(this.sinkArr, function(obj){
          if(obj){
            var configObj = {};
            _.each(obj.config, function(o){
              if(obj[o.name]){
                configObj[o.name] = obj[o.name];
              }
            });
            sink.push({
              "uiname": obj.uiname,
              "type": obj.hiddenFields ? obj.hiddenFields.type : '',
              "transformationClass": obj.hiddenFields ? obj.hiddenFields.transformationClass : '',
              "config": configObj
            });
          }
        });
        tempData.dataSinks = sink;
      } else {
        self.$el.find('#loading').removeClass('loader');
        Utils.notifyError('There are some unconfigured nodes present. Kindly configure to proceed.');
        return false;
      }
      var flag = true;
      _.each(this.linkArr,function(obj){
        if(flag){
          var sourceObj, targetObj;
          if(obj.source.parentType === 'Datasource'){
            sourceObj = self.dsArr[obj.source.nodeId];
          } else if(obj.source.parentType === 'Processor'){
            sourceObj = self.processorArr[obj.source.nodeId];
          } else if(obj.source.parentType === 'DataSink'){
            sourceObj = self.sinkArr[obj.source.nodeId];
          }
          if(obj.target.parentType === 'Datasource'){
            targetObj = self.dsArr[obj.target.nodeId];
          } else if(obj.target.parentType === 'Processor'){
            targetObj = self.processorArr[obj.target.nodeId];
          } else if(obj.target.parentType === 'DataSink'){
            targetObj = self.sinkArr[obj.target.nodeId];
          }

          if(!sourceObj || !targetObj){
            flag = false;
            self.$el.find('#loading').removeClass('loader');
            Utils.notifyError("There are some unconfigured nodes present. Kindly configure to proceed.");
          } else {
            var tempObj = {
              uiname: sourceObj.uiname + '->' + targetObj.uiname,
              type: "SHUFFLE",
              transformationClass: "com.hortonworks.iotas.topology.storm.ShuffleGroupingLinkFluxComponent",
              config: {
                "from": sourceObj.uiname,
                "to": targetObj.uiname,
              }
            };
            if(sourceObj.currentType === 'PARSER'){
              tempObj.config.streamId = obj.target.streamId;
            }
            if(sourceObj.currentType === 'RULE'){
              if(sourceObj.newConfig){
                tempObj.config.streamId = sourceObj.newConfig.rulesProcessorConfig.name+'.'+sourceObj.newConfig.rulesProcessorConfig.rules[0].name+'.'+sourceObj.newConfig.rulesProcessorConfig.rules[0].id;
              } else {
                tempObj.config.streamId = sourceObj.rulesProcessorConfig.name+'.'+sourceObj.rulesProcessorConfig.rules[0].name+'.'+sourceObj.rulesProcessorConfig.rules[0].id;
              }
            }
            tempData.links.push(tempObj);
          }
        }
      });
      // console.log(tempData);
      if(flag){
        var tData = JSON.stringify(tempData);
        this.model.set({
          name: this.topologyName,
          config: tData
        });
        delete this.model.attributes._editState;
        delete this.model.attributes.timestamp;
        this.model.save({},{
          success: function(model, response, options){
            self.topologyId = response.entity.id;
            self.saveTopologyMetaData(self.topologyId);
            self.model = new VTopology();
            self.model.id = self.topologyId;
            self.model.set('id', self.topologyId);
            self.model.set('name', response.entity.name);
            self.model.set('_editState', true);
            self.$('#deployTopology').removeAttr('disabled');
            self.$('#loading').removeClass('loader');
            Utils.notifySuccess('Topology saved successfully.');
          },
          error: function(model, response, options){
            self.$('#loading').removeClass('loader');
            Utils.showError(model, response);
          }
        });
      }
    },
    saveTopologyMetaData: function(topologyId){
      var self = this;
      var obj = {topologyId: topologyId, data: JSON.stringify(this.linkArr)};
      this.model.saveMetaInfo({
        id: self.model.id,
        data: JSON.stringify(obj),
        dataType:'json',
        contentType: 'application/json',
        success: function(model, response, options){},
        error: function(model, response, options){
          Utils.showError(model, response);
        }
      });
    },
    evDeployAction: function(e){
      this.$el.find('#loading').addClass('loader');
      if(this.topologyId){
        this.model.deployTopology({
          id: this.topologyId,
          success: function(model, response, options){
            self.$('#deployTopology').attr('disabled',true);
            self.$('#killTopology').removeAttr('disabled');
            self.$('#loading').removeClass('loader');
            Utils.notifySuccess('Topology deployed successfully.');
          },
          error: function(model, response, options){
            self.$('#loading').removeClass('loader');
            Utils.showError(model, response);
          }
        });
      } else {
        this.$el.find('#loading').removeClass('loader');
        Utils.notifyError('Need to save a topology before deploying it.');
      }
    },
    evKillAction: function(e){
      this.$el.find('#loading').addClass('loader');
      if(this.topologyId){
        this.model.killTopology({
          id: this.topologyId,
          success: function(model, response, options){
            self.$('#submitTopology').removeAttr('disabled');
            self.$('#deployTopology').removeAttr('disabled');
            self.$('#loading').removeClass('loader');
            Utils.notifySuccess('Topology killed successfully.');
          },
          error: function(model, response, options){
            self.$('#loading').removeClass('loader');
            Utils.showError(model, response);
          }
        });
      } else {
        this.$el.find('#loading').removeClass('loader');
        Utils.notifyError('Need to save a topology before killing it.');
      }
    },
    evConfigAction: function(){
      var self = this;
      require(['views/topology/TopologyLevelConfig'], function(TopologyLevelConfig){
        var view = new TopologyLevelConfig({
          model: self.topologyConfigModel,
          vent: self.vent
        });
        var modal = new Modal({
          title: 'Topology Configuration',
          content: view,
          contentWithFooter: true,
          escape: false
        }).open();
        view.on('closeModal', function(){
          view = null;
          modal.trigger('cancel');
        });
      });
    }

  });
  
  return TopologyEditorLayout;
});