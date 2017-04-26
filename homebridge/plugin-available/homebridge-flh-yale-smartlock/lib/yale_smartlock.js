'use strict';

var net = require("net");

module.exports = YaleSmartLock;

function YaleSmartLock(accessory) {
	var self = this;
	
	self.accessory = accessory;
	self.log = self.accessory.log;
	self.config = accessory.config;
	self.Characteristic = accessory.Characteristic;
//	self.currentState = self.Characteristic.LockCurrentState.UNSECURED;
//	self.securityState = self.Characteristic.SecuritySystemCurrentState.DISARMED;
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

//YaleSmartLock.prototype.getLockCurrentState = function() {
//    var self = this;
//    Characteristic.LockCurrentState.UNSECURED = 0;
//    Characteristic.LockCurrentState.SECURED = 1;
//    Characteristic.LockCurrentState.JAMMED = 2;
//    Characteristic.LockCurrentState.UNKNOWN = 3;
    
//    self.checkLockCurrentState();
//    self.log('smartlock', 'getLockCurrentState ...', self.currentState);
//
//    return self.currentState;
//};

YaleSmartLock.prototype.setupSckClient = function(cmd) {
	var self = this;
	
	self.sckClient = net.connect({port: self.config.sck_serv.port}, function() {
    	self.log('smartlock', 'sck connected to transmitter server!'); 
    	if (cmd !== undefined) {
    		self.debug('smartlock', 'send sck command:', cmd);
    		self.sckClient.write(cmd);
    	}
    });

    self.sckClient.on('data', function(data){
    	self.debug('smartlock', 'sck data received:' + data);
    	
    });
    
    self.sckClient.on('end', function(data){
    	self.log('smartlock', 'sck conn closed by server event');
    	
    });
    self.sckClient.on('error', function(ex) {
    	self.log('smartlock', 'sck error:',ex);
    	//self.sckClient.destroy();
        //self.sckClient = null;
    });
    
    self.sckClient.on('close', function(){
    	self.log('smartlock', 'sck closed');
        self.sckClient.destroy();
        self.sckClient = null;
    	self.accessory.smartlockDisconnect();
    });
	
};

YaleSmartLock.prototype.sendSckCmd = function(cmd) {
	var self = this;
	self.log('smartlock', 'send sck cmd:', cmd);

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
	self.log('smartlock','checkLockCurrentState');
	self.sendSckCmd('status');
	
};

YaleSmartLock.prototype.lock = function() {
	var self = this;
	self.log('smartlock','lock');
	self.sendSckCmd('lock');	
};

YaleSmartLock.prototype.unlock = function(state) {
    var self = this;
	self.log('smartlock','unlock');
	self.sendSckCmd('unlock');
};


YaleSmartLock.prototype.setLockState = function(state) {
    var self = this;
    
	self.log('smartlock', 'set state:', state);

	var cmd = '';
    if (state === self.Characteristic.LockCurrentState.UNSECURED) {
    	cmd = 'unlock';
    } else if (state === self.Characteristic.LockCurrentState.SECURED) {
    	cmd = 'lock';
    }
    if (cmd !== '') {
    	return self.sendSckCmd(cmd);
    } else {
    	self.log('smartlock', 'unknow state value', state);
    }

	return true;
};

	


