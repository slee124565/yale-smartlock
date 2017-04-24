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
    accessory.currentState = Characteristic.LockCurrentState.SECURED;
    accessory.targetState = Characteristic.LockTargetState.SECURED;
    accessory.currentSecurityState = Characteristic.SecuritySystemCurrentState.AWAY_ARM;
    accessory.targetSecurityState = Characteristic.SecuritySystemTargetState.AWAY_ARM;
    accessory.DEFAULT_ARMMED_STATE =Characteristic.SecuritySystemCurrentState.STAY_ARM;



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
        	accessory.log('EVENT', 'locked');
        	accessory.currentState = Characteristic.LockCurrentState.SECURED;
        	
        	accessory.services.LockMechanism
        	.setCharacteristic(Characteristic.LockCurrentState, 
        			Characteristic.LockCurrentState.SECURED);
        	accessory.statusEventHandler();
        	
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("yale event handled\n");
        }

        if (request.url === "/yale/status/unlocked") {
        	accessory.log('EVENT', 'locked');
        	accessory.currentState = Characteristic.LockCurrentState.UNSECURED;
        	
        	accessory.services.LockMechanism
        	.setCharacteristic(Characteristic.LockCurrentState, 
        			Characteristic.LockCurrentState.UNSECURED);
        	accessory.statusEventHandler();

        	response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("yale event handled\n");
        }

        if (request.url === "/yale/alarm") {
        	accessory.log('EVENT', 'alarm');

        	accessory.services.SecuritySystem
        	.setCharacteristic(Characteristic.SecuritySystemTargetState, 
        			Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);

            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("yale event handled\n");
        }

        if (request.url === "/yale/alarm_clear") {
        	accessory.log('EVENT', 'alarm clear');

        	accessory.disarmHandler();
        	
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
      .on('get', accessory.getTargetState.bind(accessory))
      .on('set', accessory.setTargetState.bind(accessory));
    
    accessory.services['LockMechanism'] = service;
    accessory.log('accessory config service:','LockMechanism')

    //-> config Homekit SecuritySystem Service
    service = new Service.SecuritySystem(accessory.name);
	
    service
	    .getCharacteristic(Characteristic.SecuritySystemCurrentState)
	    .on('get', accessory.getSecurityState.bind(accessory));
  
	service
	    .getCharacteristic(Characteristic.SecuritySystemTargetState)
	    .on('get', accessory.getTargetSecurityState.bind(accessory))
	    .on('set', accessory.setTargetSecurityState.bind(accessory));
	
    accessory.services['SecuritySystem'] = service;
    accessory.log('accessory config service:','SecuritySystem')
    
    //-> yale status initial check
    accessory.smartlock.checkLockCurrentState();

};

YaleSmartLockAccessory.prototype.smartlockDisconnect = function() {
	var accessory = this;
	
	accessory.log('smartlock sck disconnect, retry connect after 5 sec');
	setTimeout(function(){
		accessory.smartlock.setupSckClient();
	}, 5 * 1000);
}

YaleSmartLockAccessory.prototype.logState = function() {
	var accessory = this;
	accessory.log('DEBUG','currState',accessory.currentState,
			'targetState',accessory.targetState);
}

YaleSmartLockAccessory.prototype.logSecurityState = function() {
	var accessory = this;
	accessory.log('DEBUG','currSecurityState',accessory.currentSecurityState,
			'targetSecurityState',accessory.targetSecurityState);
}

YaleSmartLockAccessory.prototype.getState = function(callback) {
	var accessory = this;
	
	// return plugin obj's currentState value
	var stateText = 
		(accessory.CurrentState == Characteristic.LockCurrentState.SECURED) ? "lock" : "unlock";

	accessory.log('CALL', 'getState', stateText);
	accessory.logState();

	accessory.smartlock.checkLockCurrentState();

    if (callback !== undefined) {
		//accessory.log('accessory getState callback is not undefined');
		callback(null,accessory.currentState);
	} else {
		accessory.log('WARNING', 'accessory getState callback is undefined, skip');
	}

};

YaleSmartLockAccessory.prototype.getTargetState = function(callback) {
	var accessory = this;

	var stateText = 
		(accessory.targetState == Characteristic.LockTargetState.SECURED) ? "lock" : "unlock";

	accessory.log('CALL', 'getTargetState', stateText);
	accessory.logState();

	if (callback !== undefined) {
		// return plugin obj's currentState value
		callback(null,accessory.targetState);
	} else {
		accessory.log('WARNING', 'accessory getTargetState callback is undefined, skip');
	}
};

YaleSmartLockAccessory.prototype.setState = function(state, callback) {
	var accessory = this;
	
	//-> state value from siri
	if (state === true) {
		state = Characteristic.LockTargetState.SECURED;
	} else if (state === false) {
		state = Characteristic.LockTargetState.UNSECURED;
	}
	
	var stateText = (state == Characteristic.LockTargetState.SECURED) ? "lock" : "unlock";
	accessory.log('CALL', 'setState', state, stateText);
	accessory.logState();

	//accessory.services.LockMechanism
	//.setCharacteristic(Characteristic.LockTargetState, state);
	
	if (accessory.smartlock.setLockState(state)) {
//		accessory.services.LockMechanism
//		.setCharacteristic(Characteristic.LockCurrentState, state);
		if (callback !== undefined) {
			//accessory.log('accessory getState callback is not undefined');
			callback(null);
		} else {
			accessory.log('WARNING', 'getState callback is undefined, skip');
		}
		
	} else {
		accessory.log('ERROR', 'smartlock.setLockState fail');
		if (callback !== undefined) {
			callback(new Error("Error: " + accessory.name + " setState " + state));
		}
	}
};

YaleSmartLockAccessory.prototype.setTargetState = function(state, callback) {
	var accessory = this;
	var stateText = (state == Characteristic.LockTargetState.SECURED) ? "lock" : "unlock";

	accessory.log('CALL','setTargetState',state, stateText);
	accessory.logState();

//	accessory.services.LockMechanism
//	.setCharacteristic(Characteristic.LockTargetState, state);

	accessory.targetState = state;
	if (accessory.targetState !== accessory.currentState) {
		accessory.setState(state);
	} else {
		accessory.log('INFO','targetState == currentState, trigger status check');
		accessory.smartlock.checkLockCurrentState();
	}
}

YaleSmartLockAccessory.prototype.stateChange = function(context) {
	var accessory = this;
	
	accessory.log('CALL','stateChange','oldValue',context.oldValue,'newValue',context.newValue);
	accessory.logState();
	accessory.logSecurityState();

	accessory.currentState = context.newValue;
	if (context.newValue === Characteristic.LockCurrentState.SECURED) {
		accessory.log('INFO', 'lock is secured, set security system arm');
		accessory.setTargetSecurityState(accessory.DEFAULT_ARMMED_STATE);
	} else {
		accessory.log('INFO', 'lock is not secured, set security system disarm');
		accessory.setTargetSecurityState(Characteristic.SecuritySystemTargetState.DISARM);
	}
}

YaleSmartLockAccessory.prototype.disarmHandler = function() {
	var accessory = this;
	accessory.log('CALL','disarmHandler');
	accessory.logState();
	accessory.logSecurityState();
	
	if (accessory.currentState === Characteristic.LockCurrentState.SECURED) {
		accessory.log('INFO', 'lock is secured, set armed');
		accessory.setCurrentSecurityState(accessory.DEFAULT_ARMMED_STATE);
	} else {
		accessory.log('INFO', 'lock is not secured, set disarmed');
		accessory.setCurrentSecurityState(Characteristic.SecuritySystemCurrentState.DISARMED);
	}
}

YaleSmartLockAccessory.prototype.getSecurityState = function(callback) {
	var accessory = this;
	accessory.log('CALL','getSecurityState');
	accessory.logSecurityState();
	
	// check plugin currentState
	if (accessory.currentState === Characteristic.LockCurrentState.SECURED) {
		accessory.currentSecurityState = accessory.DEFAULT_ARMMED_STATE;
	} else {
		accessory.currentSecurityState = Characteristic.SecuritySystemCurrentState.DISARMED;
	}
	
	if (callback !== undefined) {
		// return plugin obj's currentSecurityState value
		callback(null,accessory.currentSecurityState);
	} else {
		accessory.log('WARNING', 'accessory getSecurityState callback is undefined, skip');
	}
};

YaleSmartLockAccessory.prototype.getTargetSecurityState = function(callback) {
	var accessory = this;
	accessory.log('CALL','getTargetSecurityState');
	accessory.logSecurityState();

	if (callback !== undefined) {
		// return plugin obj's currentSecurityState value
		var stateText = 
			(accessory.targetSecurityState == Characteristic.SecuritySystemTargetState.DISARMED) ? "disarmed" : "arm";
		accessory.log('INFO','plugin targetSecurityState',accessory.targetSecurityState,stateText);
		callback(null,accessory.targetSecurityState);
	} else {
		accessory.log('WARNING', 'accessory getSecurityState callback is undefined, skip');
	}
}

YaleSmartLockAccessory.prototype.setTargetSecurityState = function(state, callback) {
	var accessory = this;
	var stateText = (state == Characteristic.SecuritySystemTargetState.DISARMED) ? "disarmed" : "arm";
	accessory.log('CALL','setTargetSecurityState',state,stateText);
	accessory.logSecurityState();

 	if (state === Characteristic.SecuritySystemTargetState.STAY_ARM ||
			state === Characteristic.SecuritySystemTargetState.AWAY_ARM ||
			state === Characteristic.SecuritySystemTargetState.NIGHT_ARM) {
		
		if (accessory.currentState !== Characteristic.LockCurrentState.SECURED) {
			accessory.log('INFO','start to lock ...');
			accessory.smartlock.lock();
		} else {
			accessory.log('INFO','already locked');
		}
	} else if (state === Characteristic.SecuritySystemTargetState.DISARMED) {
		accessory.log('INFO','start to unlock ...');
		accessory.smartlock.unlock();
	}
	
	if (callback !== undefined) {
		callback(null);
	} else {
		accessory.log('WARNING', 'setSecurityState callback is undefined, skip');
	}

}

YaleSmartLockAccessory.prototype.statusEventHandler =function() {
	var accessory = this;
	accessory.log('CALL', 'statusEventHandler');
	
	if (accessory.currentSecurityState 
			=== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
		accessory.log('INFO','alarm triggered, skip status event process');
	} else {
		if (accessory.targetState !== null) {
			if (accessory.targetState === accessory.currentState) {
				accessory.log('INFO', 'targetState completed, reset');
				accessory.targetState = null;
			} else {
				accessory.log('INFO','targetState different, go for target');
				accessory.setTargetState(accessory.targetState);
			}
		} else {
			accessory.log('DEBUG','targetState already completed, skip');
		}
		
		if (accessory.targetSecurityState !== null) {
			if (accessory.targetSecurityState === accessory.currentSecurityState) {
				accessory.log('INFO', 'targetSecurityState completed, reset');
				accessory.targetSecurityState = null;
			} else {
				accessory.log('INFO','targetState different, go for target');
				accessory.setTargetSecurityState(accessory.targetState);
			}
		} else {
			accessory.log('DEBUG','targetSecurityState already completed, skip');
		}
	}
}

YaleSmartLockAccessory.prototype.getServices = function() {
	var accessory = this;
	accessory.log('CALL', 'getServices');

	var t_list = [];
	for (var key in accessory.services) {
		t_list.push(accessory.services[key]);
		accessory.log('INFO','accessory has service', key);
	}	
	
	return t_list;
}
