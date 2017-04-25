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
    accessory.DEFAULT_ARMMED_STATE = Characteristic.SecuritySystemCurrentState.AWAY_ARM;
    accessory.currentState = Characteristic.LockCurrentState.UNKNOWN;
    accessory.targetState = Characteristic.LockTargetState.SECURED;
    accessory.currentSecurityState = Characteristic.SecuritySystemCurrentState.DISARMED;
    accessory.targetSecurityState = accessory.DEFAULT_ARMMED_STATE;



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
        	accessory.log('STATUS', 'locked');

        	accessory.currentState = Characteristic.LockCurrentState.SECURED;
        	accessory.statusEventHandler();
        	
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("yale event handled\n");
        }

        if (request.url === "/yale/status/unlocked") {
        	accessory.log('STATUS', 'unlocked');
        	
        	accessory.currentState = Characteristic.LockCurrentState.UNSECURED;
        	accessory.statusEventHandler();

        	response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("yale event handled\n");
        }

        if (request.url === "/yale/event/locked") {
        	
        	if (accessory.targetState !== Characteristic.LockTargetState.SECURED) {
            	accessory.log('EVENT', 'locked');
            	//accessory.currentState = Characteristic.LockCurrentState.SECURED;
	        	accessory.services.LockMechanism
	        	.setCharacteristic(Characteristic.LockTargetState, 
	        			Characteristic.LockTargetState.SECURED);
        	} else {
            	accessory.log('DEBUG', 'event locked, ignore');
        	}
        	
            response.writeHead(200, {"Content-Type": "text/plain"});
            response.end("yale event handled\n");
        }

        if (request.url === "/yale/event/unlocked") {
        	
        	if (accessory.targetState !== Characteristic.LockTargetState.UNSECURED) {
            	accessory.log('EVENT', 'unlocked');
            	//accessory.currentState = Characteristic.LockCurrentState.UNSECURED;
	        	accessory.services.LockMechanism
	        	.setCharacteristic(Characteristic.LockTargetState, 
	        			Characteristic.LockTargetState.UNSECURED);
        	} else {
            	accessory.log('DEBUG', 'event unlocked, ignore');
        	}

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
    //accessory.smartlock.checkLockCurrentState();

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
	
	// return plugin obj's currentState value
	var stateText = 
		(accessory.currentState == Characteristic.LockCurrentState.SECURED) ? "lock" : "unlock";

	accessory.log('CALL', 'getState', accessory.currentState, stateText);

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

	accessory.log('CALL', 'getTargetState', accessory.targetState, stateText);

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

	//accessory.services.LockMechanism
	//.setCharacteristic(Characteristic.LockTargetState, state);
	
	if (accessory.smartlock.setLockState(state)) {
//		accessory.services.LockMechanism
//		.setCharacteristic(Characteristic.LockCurrentState, state);
		if (callback !== undefined) {
			callback(null);
		} else {
			accessory.log('WARNING', 'setState callback is undefined, skip');
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
	
	//-> state value from siri
	if (state === true) {
		state = Characteristic.LockTargetState.SECURED;
	} else if (state === false) {
		state = Characteristic.LockTargetState.UNSECURED;
	}
	var stateText = (state == Characteristic.LockTargetState.SECURED) ? "lock" : "unlock";

	accessory.log('CALL','setTargetState',state, stateText);

//	accessory.services.LockMechanism
//	.setCharacteristic(Characteristic.LockTargetState, state);

	accessory.targetState = state;
	if (stateText === 'lock') {
		accessory.targetSecurityState = accessory.DEFAULT_ARMMED_STATE;
	} else {
		accessory.targetSecurityState = Characteristic.SecuritySystemTargetState.DISARM;
	}
    accessory.log('INFO','set',
    		'targetState',accessory.targetState,'targetSecurityState',accessory.targetSecurityState);

    if (accessory.targetState !== accessory.currentState) {
		accessory.setState(state,callback);
	} else {
		accessory.log('INFO','targetState == currentState, skip');
		//accessory.smartlock.checkLockCurrentState();
        if (callback !== undefined) {
            callback(null);
        } else {
            accessory.log('WARNING', 'setTargetState callback is undefined, skip');
        }
    }
}

YaleSmartLockAccessory.prototype.stateChange = function(context) {
	var accessory = this;
	
	accessory.log('CALL','stateChange','oldValue',context.oldValue,'newValue',context.newValue);

	accessory.currentState = context.newValue;
	var secState;
	if (context.newValue === Characteristic.LockCurrentState.SECURED) {
		accessory.log('INFO', 'lock is secured, set security system arm');
		secState = accessory.DEFAULT_ARMMED_STATE;
	} else {
		accessory.log('INFO', 'lock is not secured, set security system disarm');
		secState = Characteristic.SecuritySystemTargetState.DISARM;
	}
    accessory.services.SecuritySystem
	.setCharacteristic(Characteristic.SecuritySystemTargetState, 
			secState);
}

YaleSmartLockAccessory.prototype.disarmHandler = function() {
	var accessory = this;
	accessory.log('CALL','disarmHandler');
	
	if (accessory.currentState === Characteristic.LockCurrentState.SECURED) {
		accessory.log('INFO', 'lock is secured, set armed');
        accessory.services.SecuritySystem
		.setCharacteristic(Characteristic.SecuritySystemTargetState, 
				accessory.DEFAULT_ARMMED_STATE);
	} else {
		accessory.log('INFO', 'lock is not secured, set disarmed');
        accessory.services.SecuritySystem
		.setCharacteristic(Characteristic.SecuritySystemTargetState, 
				Characteristic.SecuritySystemCurrentState.DISARMED);
	}
}

YaleSmartLockAccessory.prototype.getSecurityState = function(callback) {
	var accessory = this;
	accessory.log('CALL','getSecurityState');
	
	// check plugin currentState
//	if (accessory.currentState === Characteristic.LockCurrentState.SECURED) {
//		accessory.currentSecurityState = accessory.DEFAULT_ARMMED_STATE;
//	} else {
//		accessory.currentSecurityState = Characteristic.SecuritySystemCurrentState.DISARMED;
//	}
	
	if (callback !== undefined) {
		// return plugin obj's currentSecurityState value
        var stateText =
            (accessory.currentSecurityState == Characteristic.SecuritySystemTargetState.DISARMED) ? "disarmed" : "arm";
        accessory.log('INFO','plugin currentSecurityState',accessory.currentSecurityState,stateText);
		callback(null,accessory.currentSecurityState);
	} else {
		accessory.log('WARNING', 'accessory getSecurityState callback is undefined, skip');
	}
};

YaleSmartLockAccessory.prototype.getTargetSecurityState = function(callback) {
	var accessory = this;
	accessory.log('CALL','getTargetSecurityState');

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

    if (state === null) {
        accessory.log('[ERROR]','param state value invalid',state);
    } else {
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
	 	accessory.targetSecurityState = state;
        accessory.services.SecuritySystem
		.setCharacteristic(Characteristic.SecuritySystemCurrentState, state);
        accessory.currentSecurityState = state;
    }
	
	if (callback !== undefined) {
		callback(null);
	} else {
		accessory.log('WARNING', 'setSecurityState callback is undefined, skip');
	}
	accessory.log('INFO','currSecState',accessory.currentSecurityState,
			'tarSecState',accessory.targetSecurityState);
}

YaleSmartLockAccessory.prototype.statusEventHandler = function() {
	var accessory = this;
	accessory.log('CALL', 'statusEventHandler');
	
	if (accessory.currentSecurityState 
			=== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
		accessory.log('WARNING','alarm triggered, skip status event process');
	} else {
		if (accessory.targetState !== null) {
			if (accessory.targetState === accessory.currentState) {
				accessory.log('INFO', 'targetState completed');
				accessory.services.LockMechanism
				.setCharacteristic(Characteristic.LockCurrentState, 
						accessory.currentState);
			} else {
				accessory.log('INFO','targetState different, go for target');
	        	accessory.services.LockMechanism
	        	.setCharacteristic(Characteristic.LockTargetState, 
	        			accessory.targetState);
			}
		} else {
			accessory.log('DEBUG','targetState value null, skip');
		}
		
		if (accessory.targetSecurityState !== null) {
			if (accessory.targetSecurityState === accessory.currentSecurityState) {
				accessory.log('INFO', 'targetSecurityState completed');
//				accessory.services.LockMechanism
//				.setCharacteristic(Characteristic.SecuritySystemCurrentState, 
//						accessory.currentSecurityState);
			} else {
				accessory.log('INFO','targetSecurityState different, go for target');
		        accessory.services.SecuritySystem
				.setCharacteristic(Characteristic.SecuritySystemTargetState, 
						accessory.targetSecurityState);
			}
		} else {
			accessory.log('DEBUG','targetSecurityState value null, skip');
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
