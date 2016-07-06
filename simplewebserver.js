//var http = require('http');
var express = require('express');
var app = express();
var sys = require('sys');
var exec = require('child_process').exec;
var dispatch = require('dispatch');
var Promise = require('promise');
var child;

//Configuration
const PORT = 80;
const gpioPins = [0, 1, 4, 7, 8, 9, 10, 11, 15, 17, 18, 21, 22, 23, 24, 25];

//Paths
const gpioBasePath = '/sys/class/gpio/gpio';

//Handlers
const errorHandler = function (err) {
    console.log(err);
}

//Commands

//base command
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

//Return the value of gpio based shell command
var getGpioValueFromCommand = function (cmd) {
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
	child = exec(cmd, function (error, stdout, stderr) {
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

    for (pin in gpioPins) {
        exportGpioToFileSystem(pin);
    }
};

function getGpioStatus(pin) {

    var jsonObject = {
        pin: pin,
        direction: "",
        value: "",
        edge: ""
    }

    return new Promise(function (resolve, reject) {
        getGpioValueFromCommand(directionCmd(pin))
			.then(function (value) {
			    //console.log("setting direction");
			    jsonObject.direction = value;
			})
			.then(getGpioValueFromCommand(valueCmd(pin))
			.then(function (value) {
			    //console.log("setting value");
			    jsonObject.value = value;
			})
			.then(getGpioValueFromCommand(edgeCmd(pin))
			.then(function (value) {
			    //console.log("setting edge");
			    jsonObject.edge = value;
			})
			.then(function () { resolve(jsonObject) })));
    });

}

function getGpioDirection(pin, jsonObject) {
    return new Promise(function (resolve, reject) {
        //console.log("before : " +JSON.stringify(jsonObject));
        getGpioValueFromCommand(directionCmd(pin)).then(function (value) {
            //console.log("value="+value);
            jsonObject.direction = value;
            //console.log("after : " +JSON.stringify(jsonObject));
            resolve(pin, jsonObject)
        }).catch(errorHandler);

    });
}

function getGpioValue(pin, jsonObject) {
    return new Promise(function (resolve, reject) {
        getGpioValueFromCommand(valueCmd(pin)).then(function (value) {
            //console.log("value="+value);
            jsonObject.value = value;
            //console.log("heho");
            //console.log("after : " + JSON.stringify(jsonObject));
            resolve(pin, jsonObject)
        }).catch(errorHandler);
    });
}

function checkGpioPin(pin) {
    if (gpioPins.indexOf(pin) < 0)
        throw "Invalid pin number";
}


function initServer() {
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

    app.listen(PORT, function () {
        console.log("server running ! ");
    });
}

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

    //getGpioValueFromCommand(directionCmd(1)).then(console.log).then(getGpioValueFromCommand(valueCmd(4))).then(console.log);

}


(function init() {
    initGpio();
    initServer();
    //haveFun();
})();