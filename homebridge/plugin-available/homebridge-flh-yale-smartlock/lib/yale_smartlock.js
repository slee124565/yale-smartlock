'use strict';

var net = require("net");

module.exports = YaleSmartLock;

function YaleSmartLock(accessory) {
	var self = this;
	
	self.accessory = accessory;
	self.log = self.accessory.log;
	self.config = accessory.config;
	self.Characteristic = accessory.Characteristic;
	self.currentState = self.Characteristic.LockCurrentState.UNSECURED;
	self.securityState = self.Characteristic.SecuritySystemCurrentState.DISARMED;
	self.sckClient = null;
}

YaleSmartLock.prototype.debug = function() {
	var self = this;

	if (self.config.debug !== undefined) {
        var msg = []
        for (var i=0; i<arguments.length; i++) {
            msg.push(arguments[i]);
        }
		self.log('[DEBUG]',msg);
	}
};

YaleSmartLock.prototype.getLockCurrentState = function() {
    var self = this;
//    Characteristic.LockCurrentState.UNSECURED = 0;
//    Characteristic.LockCurrentState.SECURED = 1;
//    Characteristic.LockCurrentState.JAMMED = 2;
//    Characteristic.LockCurrentState.UNKNOWN = 3;
    
    self.checkLockCurrentState();
    self.log('yale getLockCurrentState ...', self.currentState);

    return self.currentState;
};

YaleSmartLock.prototype.setupSckClient = function(cmd) {
	var self = this;
	
	self.sckClient = net.connect({port: self.config.sck_serv.port}, function() {
    	self.log('yale sck connected to transmitter server!'); 
    	if (cmd !== undefined) {
    		self.debug('yale send sck command:', cmd);
    		self.sckClient.write(cmd);
    	}
    });

    self.sckClient.on('data', function(data){
    	self.debug('yale sck feedback data received:' + data);
    	
    });
    
    self.sckClient.on('end', function(data){
    	self.log('yale sck conn closed by server event');
    	
    });
    self.sckClient.on('error', function(ex) {
    	self.log('yale sck error:',ex);
    	//self.sckClient.destroy();
        //self.sckClient = null;
    });
    
    self.sckClient.on('close', function(){
    	self.log('yale sck closed');
        self.sckClient.destroy();
        self.sckClient = null;
    	self.accessory.smartlockDisconnect();
    });
	
};

YaleSmartLock.prototype.sendSckCmd = function(cmd) {
	var self = this;
	self.debug('yale send sck cmd:', cmd);

	if (self.sckClient === null) {
        self.setupSckClient(cmd);
        return false;
    } else {
	    self.sckClient.write(cmd);
	    return true;
    }
};

YaleSmartLock.prototype.checkLockCurrentState = function() {
	var self = this;
	
	self.sendSckCmd('status');
	
};

YaleSmartLock.prototype.setLockState = function(state) {
    var self = this;
    
    if (self.currentState === state) {
    	self.debug('yale current state is equal new state, skip');
    } else {

    	self.log('yale set new lock state:', state);
        var cmd = '';
        if (state === self.Characteristic.LockCurrentState.UNSECURED) {
        	cmd = 'unlock';
        } else if (state === self.Characteristic.LockCurrentState.SECURED) {
        	cmd = 'lock';
        }
        if (cmd !== '') {
        	return self.sendSckCmd(cmd);
        } else {
        	self.log('yale unknow param state value', state);
        }
    }

	return true;
};

YaleSmartLock.prototype.getSecurityState = function() {
	var self = this;
//	Characteristic.SecuritySystemCurrentState.STAY_ARM = 0;
//	Characteristic.SecuritySystemCurrentState.AWAY_ARM = 1;
//	Characteristic.SecuritySystemCurrentState.NIGHT_ARM = 2;
//	Characteristic.SecuritySystemCurrentState.DISARMED = 3;
//	Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED = 4;

	self.log('yale getSecurityState', self.securityState);
	
	if (self.currentState === self.Characteristic.LockCurrentState.SECURED) {
		//-> note: need check whether door is opened, skip now
		self.securityState = self.Characteristic.SecuritySystemCurrentState.STAY_ARM;
	} else {
		self.securityState = self.Characteristic.SecuritySystemCurrentState.DISARMED;
	}
	
	return self.securityState;
	
};

YaleSmartLock.prototype.setSecurityState = function(state) {
    var self = this;
    self.log('yale setSecurityState', state,'...');
	
    var cmd = '';
	if (state === self.Characteristic.SecuritySystemCurrentState.STAY_ARM ||
			state === self.Characteristic.SecuritySystemCurrentState.AWAY_ARM ||
			state === self.Characteristic.SecuritySystemCurrentState.NIGHT_ARM) {
		
		if (self.currentState !== self.Characteristic.LockCurrentState.SECURED) {
			cmd = 'lock';
			self.log('yale, trigger to lock');
		} else {
			self.debug('yale is already locked, skip');
		}
		
	} else if (state === self.Characteristic.SecuritySystemCurrentState.DISARMED) {
		cmd = 'unlock';
		self.log('yale, trigger to unlock');
	}
	
	if (cmd !== '') {
		if (self.sendSckCmd(cmd)) {
			self.securityState = state;
		} else {
			return false;
		}
	}

    

	return true;
};

	


