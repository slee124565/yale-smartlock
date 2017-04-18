#!/usr/bin/env python

import sys
import os,django
sys.path.append(os.path.join(os.path.dirname(__file__),'webapp'))
os.environ['DJANGO_SETTINGS_MODULE'] = 'mysite.settings'
django.setup()
from django.conf import settings
import logging
logger = logging.getLogger(__name__)

import socket
import serial
import serial.rs485
import serial.threaded
import time
import threading
import Queue
import requests

YALE_DATA_UNLOCK_BY_PIN         = [0x05,0x19,0x81,0x11]
YALE_DATA_UNLOCK_BY_IBUTTON     = [0x05,0x19,0x81,0x22]
YALE_DATA_UNLOCK_BY_FINGERPRINT = [0x05,0x19,0x81,0x23]
YALE_DATA_UNLOCK_BY_CARD        = [0x05,0x19,0x81,0x24]

YALE_DATA_ALARM_INTRUDER        = [0x05,0x19,0x82,0x11]
YALE_DATA_ALARM_DAMAGE          = [0x05,0x19,0x82,0x12]
YALE_DATA_ALARM_FIRE            = [0x05,0x19,0x82,0x13]
YALE_DATA_ALARM_CLEAR           = [0x05,0x19,0x82,0x14]

YALE_CMD_STATUS                 = [0x05,0x91,0x01,0x11,0x81,0x0f]
YALE_CMD_UNLOCK                 = [0x05,0x91,0x02,0x11,0x82,0x0f]
YALE_CMD_LOCK                   = [0x05,0x91,0x02,0x12,0x81,0x0f]

YALE_STATE_LOCKED               = [0x05,0x19,0x01,0x11]
YALE_STATE_UNLOCKED             = [0x05,0x19,0x01,0x12]

YALE_STATE_UNLOCK_RESP          = [0x05,0x19,0x02,0x11]
YALE_STATE_LOCK_RESP            = [0x05,0x19,0x02,0x12]

class SerialQueueThread(threading.Thread):
    
    def __init__(self, group=None, target=None, name=None,
                 args=(), kwargs=None, verbose=None):
        threading.Thread.__init__(self, group=group, target=target, name=name,
                                  verbose=verbose)
        self.args = args
        self.kwargs = kwargs
        self.queue = None
        self.ser = None
        self.thread_exit = False
        return
    
    def run(self):
        logger.debug('serial queue thread (daemon: %s) running ...' % self.daemon)
        while not self.thread_exit:
            cmd = ''
            try:
                cmd = self.queue.get(timeout=1)
                cmd = cmd.replace('\r\n','')
                logger.debug('recv queue cmd: %s' % cmd)
                if not self.ser is None:
                    if cmd.lower().find('lock') == 0:
                        logger.info('recv HA cmd: lock')
                        data = bytearray(YALE_CMD_LOCK)
                    elif cmd.lower().find('unlock') == 0:
                        logger.info('recv HA cmd: unlock')
                        data = bytearray(YALE_CMD_UNLOCK)
                    elif cmd.lower().find('status') == 0:
                        logger.info('recv HA cmd: status check')
                        data = bytearray(YALE_CMD_STATUS)
                    else:
                        data = []
                        logger.warning('recv HA cmd unkown: %s, ignore' % cmd)
                    
                    if len(data) > 0:
                        data_hex = ','.join('{:02x}'.format(x) for x in data)
                        logger.debug('send yale command %s' % data_hex)
                        ser.write(data)
                    else:
                        logger.debug('no data for serial port')

            except Queue.Empty:
                #logger.debug('serial cmd queue recv timeout')
                pass
        logger.debug('-- serial queue thread exit --')
    
class SerialToNet(serial.threaded.Protocol):
    """serial->socket"""

    buff = []
    
    def __init__(self):
        self.socket = None
        self.buff = []
        self.connected = False

    def __call__(self):
        return self
    
    def connection_made(self, transport):
        self.connected = True
        logger.debug('serial connect made')
        
    def connection_lost(self, exc):
        self.connected = False
        logger.warning('serial connect lost: %s' % str(exc))

    def data_received(self, data):
        data_hex = ','.join('{:02x}'.format(ord(x)) for x in data)
        logger.debug('serial recv %s' % data_hex)
        for x in data:
            self.buff.append(ord(x))
            if ord(x) == 0x0f:
                evt_name = self.process_data_frame(self.buff)
                self.buff = []
                
                if evt_name == '':
                    evt_name = 'unknown'
                    logger.warning('unknown event, raise exception')
                    raise Exception('unknown DDL event')
                    
                if settings.YALE_EVENT_HTTP_POST_SIRI_MODE:
                    pass
                else:
                    if not self.socket is None:
                        self.socket.sendall(evt_name)
                        logger.debug('feedback serial event %s' % evt_name)
    
    def process_data_frame(self,data_frame):
        data_hex = ','.join('{:02x}'.format(x) for x in data_frame)
        logger.debug('recv data frame: %s' % data_hex)
        evt_name = ''
        if len(data_frame) < 6:
            logger.warning('data frame length invalid, ignore')
        else:
            post_url = ''
            
            if cmp(data_frame[:len(YALE_DATA_UNLOCK_BY_PIN)],YALE_DATA_UNLOCK_BY_PIN) == 0:
                logger.info('DDL event => unlock by pin code')
                if settings.YALE_EVENT_HTTP_POST_SIRI_MODE:
                    evt_name = 'status/unlocked'
                else:
                    evt_name = 'unlock/pin'
                
            if cmp(data_frame[:len(YALE_DATA_UNLOCK_BY_IBUTTON)],YALE_DATA_UNLOCK_BY_IBUTTON) == 0:
                logger.info('DDL event => unlock by ibutton')
                if settings.YALE_EVENT_HTTP_POST_SIRI_MODE:
                    evt_name = 'status/unlocked'
                else:
                    evt_name = 'unlock/ibutton'

            if cmp(data_frame[:len(YALE_DATA_UNLOCK_BY_FINGERPRINT)],YALE_DATA_UNLOCK_BY_FINGERPRINT) == 0:
                logger.info('DDL event => unlock by fingerprint')
                if settings.YALE_EVENT_HTTP_POST_SIRI_MODE:
                    evt_name = 'status/unlocked'
                else:
                    evt_name = 'status/fingerprint'

            if cmp(data_frame[:len(YALE_DATA_UNLOCK_BY_CARD)],YALE_DATA_UNLOCK_BY_CARD) == 0:
                logger.info('DDL event => unlock by card')
                if settings.YALE_EVENT_HTTP_POST_SIRI_MODE:
                    evt_name = 'status/unlocked'
                else:
                    evt_name = 'status/card'

            if cmp(data_frame[:len(YALE_DATA_ALARM_INTRUDER)],YALE_DATA_ALARM_INTRUDER) == 0:
                logger.info('DDL event => intruder alarm')
                if settings.YALE_EVENT_HTTP_POST_SIRI_MODE:
                    evt_name = 'alarm'
                else:
                    evt_name = 'alarm/intruder'

            if cmp(data_frame[:len(YALE_DATA_ALARM_DAMAGE)],YALE_DATA_ALARM_DAMAGE) == 0:
                logger.info('DDL event => damage alarm')
                if settings.YALE_EVENT_HTTP_POST_SIRI_MODE:
                    evt_name = 'alarm'
                else:
                    evt_name = 'alarm/damage'

            if cmp(data_frame[:len(YALE_DATA_ALARM_FIRE)],YALE_DATA_ALARM_FIRE) == 0:
                logger.info('DDL event => fire alarm')
                if settings.YALE_EVENT_HTTP_POST_SIRI_MODE:
                    evt_name = 'alarm'
                else:
                    evt_name = 'alarm/fire'
                
            if cmp(data_frame[:len(YALE_DATA_ALARM_CLEAR)],YALE_DATA_ALARM_CLEAR) == 0:
                logger.info('DDL event => alarm clear')
                if settings.YALE_EVENT_HTTP_POST_SIRI_MODE:
                    evt_name = 'alarm_clear'
                else:
                    evt_name = 'alarm_clear'
                
                
            if cmp(data_frame[:len(YALE_STATE_LOCKED)],YALE_STATE_LOCKED) == 0 or \
                cmp(data_frame[:len(YALE_STATE_LOCK_RESP)],YALE_STATE_LOCK_RESP) == 0:
                logger.info('DDL status => locked')
                if settings.YALE_EVENT_HTTP_POST_SIRI_MODE:
                    evt_name = 'status/locked'
                else:
                    evt_name = 'status/locked'
                
            if cmp(data_frame[:len(YALE_STATE_UNLOCKED)],YALE_STATE_UNLOCKED) == 0 or \
                cmp(data_frame[:len(YALE_STATE_UNLOCK_RESP)],YALE_STATE_UNLOCK_RESP) == 0:
                logger.info('DDL status => unlocked')
                if settings.YALE_EVENT_HTTP_POST_SIRI_MODE:
                    evt_name = 'status/unlocked'
                else:
                    evt_name = 'status/unlocked'
            
            logger.debug('parse received data event: %s' % evt_name)
            
#             if settings.YALE_EVENT_HTTP_POST_SIRI_MODE:
#                 if evt_name != '':
#                     post_url = settings.YALE_EVENT_HTTP_POST_NOTIFY_URL_ROOT + evt_name
#                     r = requests.get(post_url)
#                     if r.status_code == 200:
#                         logger.info('DDL event %s http post notify to url %s' % (evt_name,post_url))
#                     else:
#                         logger.warning('DDL event %s http post fail with url %s' % (evt_name,post_url))
#                 else:
#                     logger.warning('unhandle data frame %s' % data_hex)

        return evt_name

def sck_cmd_handler(ser, cmd):
    data = []    
    cmd = cmd.replace('\r\n','')
    logger.debug('sck_cmd_handler: %s' % cmd)
    if not ser is None: 
        if cmd.lower().find('lock') == 0:
            logger.info('recv HA cmd: lock')
            data = bytearray(YALE_CMD_LOCK)
        elif cmd.lower().find('unlock') == 0:
            logger.info('recv HA cmd: unlock')
            data = bytearray(YALE_CMD_UNLOCK)
        elif cmd.lower().find('status') == 0:
            logger.info('recv HA cmd: status check')
            data = bytearray(YALE_CMD_STATUS)
        else:
            logger.warning('recv HA cmd unkown: %s, ignore' % cmd)
    
    if len(data) > 0:
        data_hex = ','.join('{:02x}'.format(x) for x in data)
        logger.debug('send yale command %s' % data_hex)
        ser.write(data)
        return True
    else:
        logger.debug('no data for serial port')
        return False

if __name__ == '__main__':  # noqa
    import argparse

    parser = argparse.ArgumentParser(
        description='Yale SmartLock Transmitter Socket Server for Homebridge and HC2',
        epilog="""\
NOTE: no security measures are implemented. Anyone can remotely connect
to this service over the network.

Only one connection at once is supported. When the connection is terminated
it waits for the next connect.
""")

    parser.add_argument(
        'SERIALPORT',
        help="serial port name")

    parser.add_argument(
        'BAUDRATE',
        type=int,
        nargs='?',
        help='set baud rate, default: %(default)s',
        default=19200)

    parser.add_argument(
        '-q', '--quiet',
        action='store_true',
        help='suppress non error messages',
        default=False)

    parser.add_argument(
        '--develop',
        action='store_true',
        help='Development mode, prints Python internals on errors',
        default=False)

    group = parser.add_argument_group('serial port')

    group.add_argument(
        "--parity",
        choices=['N', 'E', 'O', 'S', 'M'],
        type=lambda c: c.upper(),
        help="set parity, one of {N E O S M}, default: N",
        default='N')

    group.add_argument(
        '--rtscts',
        action='store_true',
        help='enable RTS/CTS flow control (default off)',
        default=False)

    group.add_argument(
        '--xonxoff',
        action='store_true',
        help='enable software flow control (default off)',
        default=False)

    group.add_argument(
        '--rts',
        type=int,
        help='set initial RTS line state (possible values: 0, 1)',
        default=None)

    group.add_argument(
        '--dtr',
        type=int,
        help='set initial DTR line state (possible values: 0, 1)',
        default=None)

    group = parser.add_argument_group('network settings')

    exclusive_group = group.add_mutually_exclusive_group()

    exclusive_group.add_argument(
        '-P', '--localport',
        type=int,
        help='local TCP port',
        default=19200)

    exclusive_group.add_argument(
        '-c', '--client',
        metavar='HOST:PORT',
        help='make the connection as a client, instead of running a server',
        default=False)

    args = parser.parse_args()
    
    # connect to serial port
    ser = serial.serial_for_url(args.SERIALPORT, do_not_open=True)
    ser.baudrate = args.BAUDRATE
    ser.parity = args.parity
    ser.rtscts = args.rtscts
    ser.xonxoff = args.xonxoff
    
    if args.rts is not None:
        ser.rts = args.rts

    if args.dtr is not None:
        ser.dtr = args.dtr

    if not args.quiet:
        logger.info(
            '--- TCP/IP to Serial redirect on {p.name}  {p.baudrate},{p.bytesize},{p.parity},{p.stopbits} ---\n'
            '--- type Ctrl-C / BREAK to quit\n'.format(p=ser))

    try:
        ser.open()
    except serial.SerialException as e:
        logger.error('Could not open serial port {}: {}\n'.format(ser.name, e))
        sys.exit(1)
        
    # setup serial port command queue
    q = Queue.Queue()
 
    ser_to_net = SerialToNet()
    serial_worker = serial.threaded.ReaderThread(ser, ser_to_net)
    serial_worker.start()
    
    ser_q_worker = SerialQueueThread()
    ser_q_worker.ser = ser
    ser_q_worker.queue = q
    ser_q_worker.start()

    if not args.client:
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind(('', args.localport))
        srv.listen(1)
        
    try:
        intentional_exit = False
        while True:
            if args.client:
                host, port = args.client.split(':')
                logger.info("Opening connection to {}:{}...\n".format(host, port))
                client_socket = socket.socket()
                try:
                    client_socket.connect((host, int(port)))
                except socket.error as msg:
                    logger.warning('WARNING: {}\n'.format(msg))
                    time.sleep(5)  # intentional delay on reconnection as client
                    continue
                logger.info('Connected\n')
                client_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                #~ client_socket.settimeout(15)
            else:
                logger.info('Waiting for connection on {}...\n'.format(args.localport))
                client_socket, addr = srv.accept()
                logger.info('Connected by {}\n'.format(addr))
                # More quickly detect bad clients who quit without closing the
                # connection: After 1 second of idle, start sending TCP keep-alive
                # packets every 1 second. If 3 consecutive keep-alive packets
                # fail, assume the client is gone and close the connection.
                client_socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
                client_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 1)
                client_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 1)
                client_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 3)
                client_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            try:
                ser_to_net.socket = client_socket
                # enter network <-> serial loop
                while True:
                    try:
                        data = client_socket.recv(1024)
                        if not data:
                            break
                        logger.debug('recv sck cmd: %s' % data)
                        q.put(data)
#                         sck_cmd_handler(ser,data)
#                         ser.write(data)                 # get a bunch of bytes and send them
                    except socket.error as msg:
                        if args.develop:
                            raise
                        sys.stderr.write('ERROR: {}\n'.format(msg))
                        # probably got disconnected
                        break
            except KeyboardInterrupt:
                intentional_exit = True
                raise
            except socket.error as msg:
                if args.develop:
                    raise
                sys.stderr.write('ERROR: {}\n'.format(msg))
            finally:
                ser_to_net.socket = None
                sys.stderr.write('Disconnected\n')
                client_socket.close()
                if args.client and not intentional_exit:
                    time.sleep(5)  # intentional delay on reconnection as client
    except KeyboardInterrupt:
        pass

    serial_worker.stop()
    ser_q_worker.thread_exit = True;
    ser_q_worker.join()
    
    sys.stderr.write('\n--- exit ---\n')
