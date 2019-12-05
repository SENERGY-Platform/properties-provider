/*
 *    Copyright 2019 InfAI (CC SES)
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

var entryFactory = require('bpmn-js-properties-panel/lib/factory/EntryFactory');
var getBusinessObject = require('bpmn-js/lib/util/ModelUtil').getBusinessObject;
var extensionElementsHelper = require('bpmn-js-properties-panel/lib/helper/ExtensionElementsHelper');
var ImplementationTypeHelper = require('bpmn-js-properties-panel/lib/helper/ImplementationTypeHelper');
var helper = require('./helper');
const typeString = "https://schema.org/Text";
const typeInteger = "https://schema.org/Integer";
const typeFloat = "https://schema.org/Float";
const typeBoolean = "https://schema.org/Boolean";
const typeList = "https://schema.org/ItemList";
const typeStructure = "https://schema.org/StructuredValue";

function generateUUID() { // Public Domain/MIT
    var d = new Date().getTime();
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        d += performance.now(); //use high-precision timer if available
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

var createInputParameter = function (bpmnjs, name, value, definition) {
    var moddle = bpmnjs.get('moddle');
    if (value !== null) {
        return moddle.create('camunda:InputParameter', {
            name: name,
            value: value
        });
    }
    if (definition) {
        return moddle.create('camunda:InputParameter', {
            name: name,
            definition: definition
        });
    }
};

var createTextInputParameter = function (bpmnjs, name, value) {
    return createInputParameter(bpmnjs, name, value, null)
};

var createMailParameter = function (bpmnjs, to, subj, content) {
    return [
        createInputParameter(bpmnjs, "to", to),
        createInputParameter(bpmnjs, "subject", subj),
        createInputParameter(bpmnjs, "text", content),
    ];
};

var createScriptInputParameter = function (bpmnjs, name, value) {
    var moddle = bpmnjs.get('moddle');
    var script = moddle.create('camunda:Script', {
        scriptFormat: "Javascript",
        value: value
    });
    return createInputParameter(bpmnjs, name, null, script)
};

var createInputOutput = function (bpmnjs, inputs, outputs) {
    var moddle = bpmnjs.get('moddle');
    return moddle.create('camunda:InputOutput', {
        inputParameters: inputs,
        outputParameters: outputs
    });
};

var createConnector = function (bpmnjs, connectorId, inputs, outputs) {
    var moddle = bpmnjs.get('moddle');
    return moddle.create('camunda:Connector', {
        connectorId: connectorId,
        inputOutput: createInputOutput(bpmnjs, inputs, outputs)
    });
};

function getPayload(connectorInfo) {
    return JSON.stringify({
        function: connectorInfo.function,
        device_class: connectorInfo.device_class || null,
        aspect: connectorInfo.aspect || null,
        label: connectorInfo.function.name,
        input: generateInputStructure(connectorInfo.characteristic),
        characteristic_id: connectorInfo.characteristic.id
    }, null, 4)
}

function createOutputParameter(bpmnjs, name, value, definition) {
    var moddle = bpmnjs.get('moddle');
    if (value) {
        return moddle.create('camunda:OutputParameter', {
            name: name,
            value: value
        });
    }
    if (definition) {
        return moddle.create('camunda:OutputParameter', {
            name: name,
            definition: definition
        });
    }
}

var setExtentionsElement = function (bpmnjs, parent, child) {
    var moddle = bpmnjs.get('moddle');
    parent.extensionElements = moddle.create('bpmn:ExtensionElements', {
        values: [child]
    });
};

function createScriptOutputParameter(bpmnjs, name, value) {
    var moddle = bpmnjs.get('moddle');
    var script = moddle.create('camunda:Script', {
        scriptFormat: "Javascript",
        value: value
    });
    return createOutputParameter(bpmnjs, name, null, script)
}

function getOutputScript() {
    return "JSON.parse(connector.getVariable('response'));"
}

function getRoot(businessObject) {
    var parent = businessObject;
    while (parent.$parent) {
        parent = parent.$parent;
    }
    return parent;
}

function createTaskParameter(bpmnjs, inputs) {
    var result = [];
    if (inputs === null || inputs === undefined) {
        return result;
    }
    var inputPaths = getParameterPaths(inputs);
    for (i = 0; i < inputPaths.length; i++) {
        result.push(createTextInputParameter(bpmnjs, inputPaths[i].path, inputPaths[i].value));
    }
    return result;
}

function getParameterPaths(value, path) {
    if(!path){
        path = "inputs"
    }
    //is primitive
    if(value !== Object(value)){
        return [{path: path, value: JSON.stringify(value)}]
    }
    var result = [];
    for(var key in value){
        result = result.concat(getParameterPaths(value[key], [path, key].join(".")))
    }
    return result
}

function generateInputStructure(characteristic) {
    switch (characteristic.type) {
        case typeString: {
            return "";
        }
        case typeFloat: {
            return 0.0;
        }
        case typeInteger: {
            return 0;
        }
        case typeBoolean: {
            return false;
        }
        case typeStructure: {
           var result = {};
            characteristic.sub_characteristics.forEach(function (subCharacteristic) {
                result[subCharacteristic.name] = generateInputStructure(subCharacteristic)
            });
            return result;
        }
        case typeList: {
            var result = [];
            characteristic.sub_characteristics.forEach(function (subCharacteristic) {
                result[parseInt(subCharacteristic.name)] = generateInputStructure(subCharacteristic)
            });
            return result;
        }
    }
}

function createTaskResults(bpmnjs, outputs) {
    var result = [];
    if (!outputs || outputs == "") {
        return result;
    }
    var paths = helper.getOutputPaths(outputs);
    var variables = [];
    for (i = 0; i < paths.length; i++) {
        variables.push("${result." + paths[i].join(".") + "}")
    }
    variables.sort();
    for (i = 0; i < variables.length; i++) {
        var name = paths[i][paths[i].length - 1].replace(/[\[\]]/g, "_");
        result.push(createOutputParameter(bpmnjs, name, variables[i], null));
    }
    return result;
}


function getDeviceTypeServiceFromServiceElement(element) {
    var bo = getBusinessObject(element);
    var extentionElements = bo.extensionElements;
    if (extentionElements && extentionElements.values && extentionElements.values[0]) {
        var inputs = extentionElements.values[0].inputParameters;
        for (i = 0; i < inputs.length; i++) {
            if (inputs[i].name == "payload") {
                var payload = JSON.parse(inputs[i].value);
              return {
                function: payload.function,
                device_class: payload.device_class,
                aspect: payload.aspect,
                completionStrategy: bo.get('camunda:topic')
              };
            }
        }
    }
}


module.exports = {
    email: function (group, element, bpmnjs, eventBus, bpmnFactory, replace, selection) {
        var refresh = function () {
            eventBus.fire('elements.changed', {elements: [element]});
        };

        if (bpmnjs.designerCallbacks.configEmail) {
            group.entries.push({
                id: "send-email-helper",
                html: "<button class='bpmn-iot-button' data-action='sendEmailHelper'>Email</button>",
                sendEmailHelper: function (element, node) {
                    var moddle = bpmnjs.get('moddle');
                    var bo = getBusinessObject(element);
                    var to = "";
                    var subject = "";
                    var content = "";
                    if (
                        bo.extensionElements
                        && bo.extensionElements.values
                        && bo.extensionElements.values[0]
                        && bo.extensionElements.values[0].inputOutput
                        && bo.extensionElements.values[0].inputOutput.inputParameters
                    ) {
                        var inputs = bo.extensionElements.values[0].inputOutput.inputParameters;
                        for (var i = 0; i < inputs.length; i++) {
                            if (inputs[i].name == "to") {
                                to = inputs[i].value;
                            }
                            if (inputs[i].name == "subject") {
                                subject = inputs[i].value;
                            }
                            if (inputs[i].name == "text") {
                                content = inputs[i].value;
                            }
                        }
                    }

                    bpmnjs.designerCallbacks.configEmail(to, subject, content, function (to, subj, content) {
                        helper.toServiceTask(bpmnFactory, replace, selection, element, function (serviceTask, element) {
                            serviceTask.name = "send mail";
                            var inputs = createMailParameter(bpmnjs, to, subj, content);
                            var mailConnector = createConnector(bpmnjs, "mail-send", inputs, []);
                            setExtentionsElement(bpmnjs, serviceTask, mailConnector);
                            refresh();
                        });
                    }, function () {

                    });
                    return true;
                }
            });
        }
    },

    external: function (group, element, bpmnjs, eventBus, bpmnFactory, replace, selection) {
        var refresh = function () {
            eventBus.fire('elements.changed', {elements: [element]});
        };

        group.entries.push({
            id: "iot-extern-device-type-select-button",
            html: "<button class='bpmn-iot-button' data-action='selectIotDeviceTypeForExtern'>Select Function</button>",
            selectIotDeviceTypeForExtern: function (element, node) {
                bpmnjs.designerCallbacks.findIotDeviceType(getDeviceTypeServiceFromServiceElement(element), function (connectorInfo) {
                    helper.toExternalServiceTask(bpmnFactory, replace, selection, element, function (serviceTask, element) {
                        serviceTask.topic = connectorInfo.completionStrategy;
                        serviceTask.name = (connectorInfo.device_class.name || connectorInfo.aspect.name) + " " + connectorInfo.function.name;
                        var script = createTextInputParameter(bpmnjs, "payload", getPayload(connectorInfo));
                        var parameter = createTaskParameter(bpmnjs, generateInputStructure(connectorInfo.characteristic));
                        var inputs = [script].concat(parameter);

                        var outputs;

                        if(serviceTask.topic == "optimistic"){
                            outputs = createTaskResults(bpmnjs, "");
                        }else{
                            outputs = createTaskResults(bpmnjs, connectorInfo.skeleton.outputs);
                        }

                        var inputOutput = createInputOutput(bpmnjs, inputs, outputs);
                        setExtentionsElement(bpmnjs, serviceTask, inputOutput);

                        refresh();

                        element.iot = {
                            connectorInfo: connectorInfo,
                            inputScript: script
                        };
                    });
                });
                return true;
            }
        });

        function inputsExist(element) {
            if (element.businessObject.extensionElements
                && element.businessObject.extensionElements.values
                && element.businessObject.extensionElements.values[0]
                && element.businessObject.extensionElements.values[0].inputParameters
                && element.businessObject.extensionElements.values[0].inputParameters.length > 1
            ) {
                return true
            }
            return false;
        }

        function outputsExist(element) {
            if (element.businessObject.extensionElements
                && element.businessObject.extensionElements.values
                && element.businessObject.extensionElements.values[0]
                && element.businessObject.extensionElements.values[0].outputParameters
                && element.businessObject.extensionElements.values[0].outputParameters.length > 0
                && element.businessObject.topic == "pessimistic"
            ) {
                return true
            }
            return false;
        }

        if (inputsExist(element)) {
            group.entries.push({
                id: "iot-extern-device-input-edit-button",
                html: "<button class='bpmn-iot-button' data-action='editInput'>Edit Input</button>",
                editInput: function (element, node) {
                    bpmnjs.designerCallbacks.editInput(element, function () {
                        refresh();
                    });
                    return true;
                }
            });
        }

        if (outputsExist(element)) {
            group.entries.push({
                id: "iot-extern-device-output-edit-button",
                html: "<button class='bpmn-iot-button' data-action='editOutput'>Select Output-Variables</button>",
                editOutput: function (element, node) {
                    var outputs = element.businessObject.extensionElements.values[0].outputParameters;
                    bpmnjs.designerCallbacks.editOutput(outputs, function () {
                        refresh();
                    });
                    return true;
                }
            });
        }
    },

    influx: function (group, element, bpmnjs, eventBus, bpmnFactory, replace, selection) {
        var refresh = function () {
            eventBus.fire('elements.changed', {elements: [element]});
        };

        group.entries.push({
            id: "iot-influx-device-type-select-button",
            html: "<button class='bpmn-iot-button' data-action='influxButton'>Add data analysis</button>",
            influxButton: function (element, node) {
                bpmnjs.designerCallbacks.editHistoricDataConfig(getAggregationConfigFromServiceElement(element), function (config) {
                    helper.toExternalServiceTask(bpmnFactory, replace, selection, element, function (serviceTask, element) {
                        // Set topic and name in designer 
                        serviceTask.topic = "export"
                        serviceTask.name = config.analysisAction

                        // Set input and output variables for the process
                        var inputs = [createTextInputParameter(bpmnjs, "config", JSON.stringify(config))]
                        var outputs = [createOutputParameter(bpmnjs, "export_result", "${global_export_result}", null)]
                        var inputOutput = createInputOutput(bpmnjs, inputs, outputs)
                        setExtentionsElement(bpmnjs, serviceTask, inputOutput)

                        refresh();
                    });
                });
                return true;
            }
        });

        function getAggregationConfigFromServiceElement(element) {
            var extentionElements = getBusinessObject(element).extensionElements;
            if (extentionElements && extentionElements.values && extentionElements.values[0]) {
                var inputs = extentionElements.values[0].inputParameters;
                var config = JSON.parse(inputs[0].value);
                return config;
            }
        }

        function outputsExist(element) {
            if (element.businessObject.extensionElements
                && element.businessObject.extensionElements.values
                && element.businessObject.extensionElements.values[0]
                && element.businessObject.extensionElements.values[0].outputParameters
                && element.businessObject.extensionElements.values[0].outputParameters.length > 0
                && element.businessObject.topic == "export"
            ) {
                return true
            }
            return false;
        }

        if (outputsExist(element)) {
            group.entries.push({
                id: "iot-extern-device-output-edit-button",
                html: "<button class='bpmn-iot-button' data-action='editOutput'>Select Output-Variables</button>",
                editOutput: function (element, node) {
                    var outputs = element.businessObject.extensionElements.values[0].outputParameters;
                    bpmnjs.designerCallbacks.editOutput(outputs, function () {
                        refresh();
                    });
                    return true;
                }
            });
        }
    },

    info: function (group, element, bpmnjs) {
        group.entries.push({
            id: "iot-extern-device-variable-list",
            html: bpmnjs.designerCallbacks.getInfoHtml(element)
        });
    },

    timeHelper: function (group, element, bpmnjs, eventBus, modeling) {
        group.entries.push({
            id: "set-duration",
            html: "<button class='bpmn-iot-button' data-action='setDuration'>set Duration</button>",
            setDuration: function (element, node) {
                var moddle = bpmnjs.get('moddle');
                var bo = getBusinessObject(element).eventDefinitions[0];
                bpmnjs.designerCallbacks.durationDialog(bo.timeDuration && bo.timeDuration.body).then(function (result) {
                    var duration = moddle.create('bpmn:FormalExpression', {
                        body: result.iso.string
                    });

                    if (bo.timeCycle) {
                        delete bo.timeCycle;
                    }
                    if (bo.timeDate) {
                        delete bo.timeDate;
                    }
                    if (bo.timeDuration) {
                        delete bo.timeDuration;
                    }

                    bo.timeDuration = duration;
                    eventBus.fire('elements.changed', {elements: [element]});
                    modeling.updateProperties(element, {name: result.text});
                }, function () {

                });
                return true;
            }
        });

        group.entries.push({
            id: "set-date",
            html: "<button class='bpmn-iot-button' data-action='setDate'>set Date</button>",
            setDate: function (element, node) {
                var moddle = bpmnjs.get('moddle');
                var bo = getBusinessObject(element).eventDefinitions[0];
                bpmnjs.designerCallbacks.dateDialog(bo.timeDate && bo.timeDate.body).then(function (result) {
                    var dateString = result.iso;
                    var date = moddle.create('bpmn:FormalExpression', {
                        body: dateString
                    });
                    if (bo.timeCycle) {
                        delete bo.timeCycle;
                    }
                    if (bo.timeDate) {
                        delete bo.timeDate;
                    }
                    if (bo.timeDuration) {
                        delete bo.timeDuration;
                    }

                    bo.timeDate = date;
                    eventBus.fire('elements.changed', {elements: [element]});
                    modeling.updateProperties(element, {name: result.text});
                }, function () {

                });
                return true;
            }
        });

        group.entries.push({
            id: "set-cycle",
            html: "<button class='bpmn-iot-button' data-action='setCycle'>set Cycle</button>",
            setCycle: function (element, node) {
                var moddle = bpmnjs.get('moddle');
                var bo = getBusinessObject(element).eventDefinitions[0];
                bpmnjs.designerCallbacks.cycleDialog(bo.timeCycle && bo.timeCycle.body).then(function (result) {
                    var date = moddle.create('bpmn:FormalExpression', {
                        body: result.cron
                    });

                    if (bo.timeCycle) {
                        delete bo.timeCycle;
                    }
                    if (bo.timeDate) {
                        delete bo.timeDate;
                    }
                    if (bo.timeDuration) {
                        delete bo.timeDuration;
                    }

                    bo.timeCycle = date;
                    eventBus.fire('elements.changed', {elements: [element]});
                    modeling.updateProperties(element, {name: result.text});
                }, function () {

                });
                return true;
            }
        });
    }
};
