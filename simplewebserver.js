var express = require('express');
var app = express();
var sys = require('util');
var exec = require('child_process').exec;
var dispatch = require('dispatch');
var Promise = require('promise');
var async = require('async');

//Configuration
const PORT = 80;
const gpioPins = [0, 1, 4, 7, 8, 9, 10, 11, 15, 17, 18, 21, 22, 23, 24, 25];

//const json
const jsonOkResult = { "result" : "ok" };

//Paths
const gpioBasePath = '/sys/class/gpio/gpio';

//Handlers
const errorHandler = function (err) {
    console.log(err);
}

//GPIO Commands

//GPIO Base get command
const baseCmd = function (pin) {
    return 'sudo cat ' + gpioBasePath + pin;
}

//Direction of gpio pin
const directionCmd = function (pin) {
    return baseCmd(pin) + '/direction';
}

//Value of gpio pin
const valueCmd = function (pin) {
    return baseCmd(pin) + '/value';
}

//Edge of gpio pin
const edgeCmd = function (pin) {
    return baseCmd(pin) + '/edge';
}

//GPIO base set command
const setBaseCmd = function (value){
    return 'sudo echo '+value+ ' > ';
}

//Set direction command
const setDirectionCmd = function(pin,direction){
    return setBaseCmd(direction) + gpioBasePath + pin + "/direction"
}

//Set direction command
const setValueCmd = function(pin,value){
    return setBaseCmd(value) + gpioBasePath + pin + "/value"
}

//RaspberryPi Commands

//Temperature command
const tempCmd = 'sudo cat /sys/class/thermal/thermal_zone0/temp'

//date command
const dateCmd = 'date'

//Return the value of gpio based shell command
var getValueFromCommand = function (cmd) {
    return new Promise(function (resolve, reject) {

        var value = null;

        exec(cmd, function (error, stdout, stderr) {
            if (error == null) {

                if (stdout == null) {
                    value = null;
                }
                else if (stdout.indexOf('\n') >= 0)
                    value = stdout.replace('\n', '');
                else {
                    console.log("else");
                    value = stdout;
                }

                try{
                    var savedValue = value;
                    value = parseInt(value);
                    if(isNaN(value))
                        value = savedValue;
                }
                catch(err){
                   
                }

                console.log('Executed command : ' + cmd);
                console.log('Result :' + value);

                resolve(value);
            }
            else {
                reject(error);
            }
        });

    });
};

//Export a gpio based on his pin number to the linux filesystem
//does nothing if the gpio pin has already been exported
function exportGpioToFileSystem(pin) {

    var cmd = 'sudo test -d ' + gpioBasePath + pin + ' && echo  || sudo echo ' + pin + ' > /sys/class/gpio/export';
    //console.log(cmd);
    exec(cmd, function (error, stdout, stderr) {
        if (error == null) {
            console.log('GPIO ' + pin + ' exported or already exported');
        }
        else {
            console.log('error on pin' + pin + ' : ' + error);
        }
    });

}

//Init the gpio pins (export)
function initGpio() {
    console.log('calling init');

    gpioPins.forEach(function(pin){
        exportGpioToFileSystem(pin);
    });
};

//Get the raspberry pi status and the status of every gpio pin
function getRaspberryStatus() {

    return new Promise(function (resolve, reject) {
        var jsonObject = {
            "raspberry": {

            }
        };

        getValueFromCommand(tempCmd).then(function (value) {
            console.log('temperature:'+value);
            jsonObject.raspberry.temperature = value;
        }).catch(errorHandler)
        getValueFromCommand(dateCmd).then(function (value) {
            console.log('date:'+value);
            jsonObject.raspberry.date = value;
        })
        .then(function () {
            async.eachSeries(gpioPins, function iterate(item, callback) {
                getGpioStatus(item).catch(errorHandler).then(function (json) {
                    console.log(json);
                    jsonObject.raspberry["gpio" + item] = json;
                    callback();
                });

            }, function done() {
                console.log('done');
                resolve(jsonObject);
            });
        });



    });

}

//Return a premise with the json object representing the current state of the pin
function getGpioStatus(pin) {

    var jsonObject = {
        pin: pin
    }

    return new Promise(function (resolve, reject) {
        getValueFromCommand(directionCmd(pin)).catch(errorHandler)
			.then(function (value) {
			    jsonObject.direction = value;
			}).catch(errorHandler)
			.then(getValueFromCommand(valueCmd(pin)).catch(errorHandler)
			.then(function (value) {
			    jsonObject.value = value;
			}).catch(errorHandler)
			.then(getValueFromCommand(edgeCmd(pin)).catch(errorHandler)
			.then(function (value) {
			    jsonObject.edge = value;
			}).catch(errorHandler)
			.then(function () { resolve(jsonObject) }))).catch(errorHandler);
    });

}

//Returns the "direction" property of the specied pin and feeds the jsonObject passed as parameter. This returns a premise
function getGpioDirection(pin, jsonObject) {
    return new Promise(function (resolve, reject) {
        getValueFromCommand(directionCmd(pin)).then(function (value) {
            jsonObject.direction = value;
            resolve(pin, jsonObject)
        }).catch(errorHandler);

    });
}

//Sets the direction of a gpio
function setGpioDirection(pin, direction) {
    return new Promise(function (resolve, reject) {
        getValueFromCommand(setDirectionCmd(pin,direction)).then(function (v) {
            console.log(v);
            resolve(v)
        }).catch(errorHandler);

    });
}

//Returns the "value" property of the specied pin and feeds the jsonObject passed as parameter. This returns a premise
function getGpioValue(pin, jsonObject) {
    return new Promise(function (resolve, reject) {
        getValueFromCommand(valueCmd(pin)).then(function (value) {
            jsonObject.value = value;
            resolve(pin, jsonObject)
        }).catch(errorHandler);
    });
}

function setGpioValue(pin, value) {
    return new Promise(function (resolve, reject) {
        getValueFromCommand(setValueCmd(pin,value)).then(function (v) {
            console.log(v);
            resolve(v)
        }).catch(errorHandler);

    });
}

//Check whether the pin in param is a correct GPIO Pin
function checkGpioPin(pin) {
    if (gpioPins.indexOf(pin) < 0)
        throw "Invalid pin number";
}

//Check whether the direction is ok

function checkDirection(direction){
    if(direction !== 'in' && direction !== 'out')
        throw 'Direction must be "in" or "out"';
}

///////////////////////////////////////////////////////////////////// API CONFIGURATION / WEB SERVER /////////////////////////////////////////////////////////////////////

const authorizedProperties =['direction','value'];

function checkProperty(property)
{
    if(authorizedProperties.indexOf(property) < 0){
         var msg = 'property parameter should be one of these values : ' ;
            authorizedProperties.forEach(function(authorizedProperty){
                msg+= '\n'+authorizedProperty;
            });

        throw msg;
    }
      
}
//Init the web server and contains routes + logic 
function initServer() {
    //Retrieve pin status
    app.get('/gpio/:pin', function (req, res) {

        var pin = parseInt(req.params['pin']);
        try {
            checkGpioPin(pin);
            getGpioStatus(pin).then(function (jsonObject) { res.json(jsonObject) });
        }
        catch (err) {
            res.json({ "error": err });
        }
    });

    app.post('/gpio/:pin/:property/:value',function(req,res){
        try{
            
            var property = req.params['property'];
            var pin = parseInt(req.params['pin']);
            var value = isNaN(parseInt(req.params['value'])) ? req.params['value'] : parseInt(req.params['value']) ;

            checkGpioPin(pin);
            checkProperty(property);

            console.log("property="+property);
            console.log("value="+value);
            console.log("pin="+pin);

            if(property === 'direction'){
                checkDirection(value);
                setGpioDirection(pin,value).then(function(){
                    res.json(jsonOkResult);
                })
            }
            else if(property === 'value'){
                setGpioValue(pin,value).then(function(){
                    res.json(jsonOkResult);
                })
            }

        }
       catch (err) {
            console.log(err);
            res.json({ "error": err });
        }

    });

    app.get('/gpio/:pin/:property',function(req,res){
        try{
            var jsonObject = {};
            var property = req.params['property'];
            var pin = parseInt(req.params['pin']);

            checkGpioPin(pin);
            checkProperty(property);

            console.log("property="+property);
            console.log("pin="+pin);

            if(property === 'direction'){
                checkDirection(direction);
                getGpioDirection(pin,jsonObject).then(function(p, json){
                    res.json(jsonObject);
                })
            }
            else if(property === 'value'){
                getGpioValue(pin,jsonObject).then(function(p, json){
                    res.json(jsonObject);
                })
            }

        }
       catch (err) {
            console.log(err);
            res.json({ "error": err });
        }

    });

    //retrieve raspberry status
    app.get('/raspberry', function (req, res) {
        console.log('received GET request on /raspberry')
        try {
            getRaspberryStatus().catch(errorHandler).then(function (jsonObject) { res.json(jsonObject) });
        }
        catch (err) {
            res.json({ "error": err });
        }
    });

    //Start listening on PORT
    app.listen(PORT, function () {
        console.log("server running ! ");
    });
}


//Testing stuff

function haveFun() {

    function a(n) {
        return new Promise(function (resolve, reject) {
            console.log('a');
            var x = n + 1;
            setTimeout(30000);
            resolve(x);
        });
    }

    function b(n) {
        return new Promise(function (resolve, reject) {
            console.log('b');
            var x = n * 2;
            setTimeout(1000);
            resolve(x);
        });
    }

    function c(n) {
        return new Promise(function (resolve, reject) {
            console.log('c');
            var x = n * 3;
            resolve(x);
        });
    }

    a(1).then(b).then(c).then(console.log);

    //getValueFromCommand(directionCmd(1)).then(console.log).then(getValueFromCommand(valueCmd(4))).then(console.log);

}

//Init gpio & express server
(function init() {
    initGpio();
    initServer();
    //haveFun();
})();
