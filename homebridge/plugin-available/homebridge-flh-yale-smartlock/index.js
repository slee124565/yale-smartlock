'use strict';

var PLUGIN_NAME = 'homebridge-flh-yale-smartlock';
var ACCESSORY_NAME = 'YaleSmartLock'
var WEB_API_PORT = 9000;

var http = require('http');
var YaleSmartLock = require('./lib/yale_smartlock');
var fs = require('fs');

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
    console.log("homebridge API version: " + homebridge.version);

    // Accessory must be created from PlatformAccessory Constructor
    Accessory = homebridge.platformAccessory;

    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    // For platform plugin to be considered as dynamic platform plugin,
    // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
    homebridge.registerAccessory(PLUGIN_NAME, ACCESSORY_NAME, YaleSmartLockAccessory);
};

function YaleSmartLockAccessory(log, config, api) {
    var accessory = this;
    
    accessory.log = log;
    accessory.config = config || {};
    accessory.name = config.name;
    accessory.pluginName = PLUGIN_NAME;
    accessory.accessoryName = ACCESSORY_NAME;
    accessory.Characteristic = Characteristic;
    accessory.smartlock = new YaleSmartLock(accessory);

    accessory.services = {};
    
    accessory.log('create accessory', accessory.pluginName, accessory.accessoryName, 'config', accessory.config);

    accessory.requestServer = http.createServer(function(request, response) {
    	
        if (request.url === "/setArmed") {
        	console.log('web api /setArmed');
        	accessory.setTargetSecurityState(Characteristic.SecuritySystemTargetState.NIGHT_ARM);
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("setArmed\n");
        }

        if (request.url === "/setDisarmed") {
        	console.log('web api /setDisarmed');
        	accessory.setTargetSecurityState(Characteristic.SecuritySystemTargetState.DISARM);
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("setDisarmed\n");
        }

        if (request.url === "/setArmTriggered") {
        	console.log('web api /setArmTriggered');
        	accessory.setTargetSecurityState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("setArmTriggered\n");
        }

        if (request.url === "/setLock") {
        	console.log('web api /setLock');
        	accessory.setTargetState(Characteristic.LockCurrentState.SECURED);
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("setLock\n");
        }

        if (request.url === "/setUnlock") {
        	console.log('web api /setUnlock');
        	accessory.setTargetState(Characteristic.LockCurrentState.UNSECURED);
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("setUnlock\n");
        }

        if (request.url === "/yale/status/locked") {
        	if (accessory.smartlock.currentState != Characteristic.LockCurrentState.SECURED) {
	        	accessory.log('yale event handle: locked');
        		//accessory.log('yale status changed');
	        	accessory.smartlock.currentState = Characteristic.LockCurrentState.SECURED;
	        	//accessory.setState(Characteristic.LockCurrentState.SECURED);
	        	accessory.setTargetState(Characteristic.LockTargetState.SECURED);
        	} else {
        		//accessory.log('yale event status locked, no change skip');
        	}
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("yale event handled\n");
        }

        if (request.url === "/yale/status/unlocked") {
        	if (accessory.smartlock.currentState != Characteristic.LockCurrentState.UNSECURED) {
	        	accessory.log('yale event handle: unlocked');
        		//accessory.log('yale status changed');
	        	accessory.smartlock.currentState = Characteristic.LockCurrentState.UNSECURED;
	        	//accessory.setState(Characteristic.LockCurrentState.UNSECURED);
	        	accessory.setTargetState(Characteristic.LockTargetState.UNSECURED);
        	} else {
        		//accessory.log('yale event status unlocked, no change skip');
        	}
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("yale event handled\n");
        }

        if (request.url === "/yale/alarm") {
        	accessory.log('yale event handle: alarm');
        	accessory.setTargetSecurityState(Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("yale event handled\n");
        }

        if (request.url === "/yale/alarm_clear") {
        	accessory.log('yale event handle: alarm clear');
        	accessory.setTargetSecurityState(Characteristic.SecuritySystemCurrentState.DISARMED);
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("yale event handled\n");
        }

        if (request.url === "/teapot") {
        	var obj = JSON.parse(fs.readFileSync('/var/homebridge/accessories/cachedAccessories', 'utf8'));
            var content = '== cachedAccessories ==\n' + JSON.stringify(obj,null,4);

            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end(content);
        }

    }.bind(accessory));

    accessory.requestServer.listen(WEB_API_PORT, function() {
    	accessory.log("accessory " + accessory.accessoryName + " Server Listening...");
    });
    accessory.log("accessory", accessory.accessoryName, "Web API Server Listening with Port",WEB_API_PORT);

    //-> config Homekit LockMechanism Service
	var service = new Service.LockMechanism(accessory.name);
    
	service
      .getCharacteristic(Characteristic.LockCurrentState)
      .on('get', accessory.getState.bind(accessory))
      .on('change', accessory.stateChange.bind(accessory));
    
    service
      .getCharacteristic(Characteristic.LockTargetState)
      .on('get', accessory.getState.bind(accessory))
      .on('set', accessory.setState.bind(accessory));
    
    accessory.services['LockMechanism'] = service;
    accessory.log('accessory config service:','LockMechanism')

    //-> config Homekit SecuritySystem Service
    service = new Service.SecuritySystem(accessory.name);
	
    service
	    .getCharacteristic(Characteristic.SecuritySystemCurrentState)
	    .on('get', accessory.getSecurityState.bind(accessory));
  
	service
	    .getCharacteristic(Characteristic.SecuritySystemTargetState)
	    .on('get', accessory.getSecurityState.bind(accessory))
	    .on('set', accessory.setSecurityState.bind(accessory));
	
	service
    .getCharacteristic(Characteristic.Name)
    .on('get', accessory.getSecuritySystemName.bind(accessory));
	
    
    accessory.services['SecuritySystem'] = service;
    accessory.log('accessory config service:','SecuritySystem')
    
    //-> start polling yale status
    //accessory.smartlock.setupSckClient();
    accessory.smartlock.checkLockCurrentState();
    //setInterval( function() { accessory.smartlock.checkLockCurrentState(); } , 10 * 1000);

};

YaleSmartLockAccessory.prototype.smartlockDisconnect = function() {
	var accessory = this;
	
	accessory.log('smartlock sck disconnect, retry connect after 5 sec');
	setTimeout(function(){
		accessory.smartlock.setupSckClient();
	}, 5 * 1000);
}

YaleSmartLockAccessory.prototype.getState = function(callback) {
	var accessory = this;

	var state = accessory.smartlock.getLockCurrentState();
    var stateText = (state == Characteristic.LockCurrentState.SECURED) ? "lock" : "unlock";

	accessory.log('accessor',accessory.name,'getState',stateText);

	if (callback !== undefined) {
		//accessory.log('accessory getState callback is not undefined');
		callback(null,state);
	} else {
		accessory.log('accessory getState callback is undefined');
	}
};

YaleSmartLockAccessory.prototype.setTargetState = function(state) {
	var accessory = this;
	var stateText = (state == Characteristic.LockTargetState.SECURED) ? "lock" : "unlock";

	accessory.log('accessor',accessory.name,'setTargetState',stateText);

	accessory.services.LockMechanism
	.setCharacteristic(Characteristic.LockTargetState, state);
}

YaleSmartLockAccessory.prototype.setState = function(state, callback) {
	var accessory = this;
	
	//-> state value from siri
	if (state === true) {
		state = Characteristic.LockTargetState.SECURED;
	} else if (state === false) {
		state = Characteristic.LockTargetState.UNSECURED;
	}
	
	var stateText = (state == Characteristic.LockTargetState.SECURED) ? "lock" : "unlock";
//	accessory.log('accessor',accessory.name,'setState',stateText);

	//accessory.services.LockMechanism
	//.setCharacteristic(Characteristic.LockTargetState, state);
	
	if (accessory.smartlock.setLockState(state)) {
		accessory.log('accessor',accessory.name,'setState',stateText,'success');
		accessory.services.LockMechanism
		.setCharacteristic(Characteristic.LockCurrentState, state);
		if (callback !== undefined) {
			//accessory.log('accessory getState callback is not undefined');
			callback(null);
		} else {
			accessory.log('accessory getState callback is undefined');
			
		}
		
	} else {
		accessory.log('accessor',accessory.name,'setState',stateText,'fail');
		if (callback !== undefined) {
			callback(new Error("Error: " + accessory.name + " setState " + state));
		}
	}

};

YaleSmartLockAccessory.prototype.stateChange = function(context) {
	var accessory = this;
	
	accessory.log('stateChange','oldValue',context.oldValue,'newValue',context.newValue);

	if (context.newValue === Characteristic.LockCurrentState.SECURED) {
		accessory.log('lock is secured, set armed');
		accessory.setTargetSecurityState(Characteristic.SecuritySystemCurrentState.AWAY_ARM);
	} else {
		accessory.log('lock is not secured, set disarmed');
		accessory.setTargetSecurityState(Characteristic.SecuritySystemCurrentState.DISARMED);
	}

}

YaleSmartLockAccessory.prototype.getSecurityState = function(callback) {
	var accessory = this;

	var state = accessory.smartlock.getSecurityState();
    var stateText = (state == Characteristic.SecuritySystemCurrentState.DISARMED) ? "disarmed" : "armed";
	var err = null;
	
	accessory.log('accessor',accessory.name,'getSecurityState',stateText);
	if (callback !== undefined) {
		//accessory.log('accessory getSecurityState callback is not undefined');
		callback(err,state);
	} else {
		accessory.log('accessory getSecurityState callback is undefined');
	}
};

YaleSmartLockAccessory.prototype.setTargetSecurityState = function(state) {
	var accessory = this;
	var stateText = (state == Characteristic.SecuritySystemTargetState.DISARM) ? "disarm" : "arm";

	accessory.log('accessor',accessory.name,'setTargetSecurityState',stateText,'code',state);

	accessory.services.SecuritySystem
	.setCharacteristic(Characteristic.SecuritySystemTargetState, state);
}

YaleSmartLockAccessory.prototype.setSecurityState = function(state,callback) {
	var accessory = this;
	var stateText = (state == Characteristic.SecuritySystemCurrentState.DISARMED) ? "disarmed" : "arm";

	if (accessory.smartlock.setSecurityState(state)) {
		accessory.log('accessor',accessory.name,'setSecurityState',stateText,'success');
		accessory.services.SecuritySystem
		.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
		if (callback !== undefined) {
			callback(null);
		} else {
			accessory.log('accessory setSecurityState callback is undefined');
			
		}
		
	} else {
		accessory.log('accessor',accessory.name,'setSecurityState',stateText,'fail');
		if (callback !== undefined) {
			callback(new Error("Error: " + accessory.name + " setSecurityState " + state));
		}
	}

}

YaleSmartLockAccessory.prototype.getSecuritySystemName = function(callback) {
	var accessory = this;
	var err = null;
	var name = 'test';
	accessory.log('accessor',accessory.name,'getSecuritySystemName',name);
	if (callback !== undefined) {
		callback(err,name);
	} else {
		accessory.log('accessory getSecuritySystemName callback is undefined');
	}
	
};


YaleSmartLockAccessory.prototype.getServices = function() {
	var accessory = this;
	accessory.log('accessory getServices ...');

	var t_list = [];
	for (var key in accessory.services) {
		t_list.push(accessory.services[key]);
		accessory.log('accessory has service', key);
	}	
	
	return t_list;
}
