#!/usr/bin/env python
#
# Redirect data from a TCP/IP connection to a serial port and vice versa.
#
# (C) 2002-2016 Chris Liechti <cliechti@gmx.net>
#
# SPDX-License-Identifier:    BSD-3-Clause

import sys
import os,django
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
os.environ['DJANGO_SETTINGS_MODULE'] = 'mysite.settings'
django.setup()
from django.conf import settings
import logging
logger = logging.getLogger(__name__)

#import sys
import socket
import serial
import serial.rs485
import serial.threaded
import time
import requests

YALE_DATA_UNLOCK_BY_PIN         = [0x05,0x19,0x81,0x11]
YALE_DATA_UNLOCK_BY_IBUTTON     = [0x05,0x19,0x81,0x22]
YALE_DATA_UNLOCK_BY_FINGERPRINT = [0x05,0x19,0x81,0x23]
YALE_DATA_UNLOCK_BY_CARD        = [0x05,0x19,0x81,0x24]

YALE_STATE_LOCKED               = [0x05,0x19,0x01,0x11]
YALE_STATE_UNLOCKED             = [0x05,0x19,0x01,0x12]

YALE_DATA_ALARM_INTRUDER        = [0x05,0x19,0x82,0x11]
YALE_DATA_ALARM_DAMAGE          = [0x05,0x19,0x82,0x12]
YALE_DATA_ALARM_FIRE            = [0x05,0x19,0x82,0x13]

YALE_CMD_STATUS                 = [0x05,0x91,0x01,0x11,0x81,0x0f]
YALE_CMD_UNLOCK                 = [0x05,0x91,0x02,0x11,0x82,0x0f]
YALE_CMD_LOCK                   = [0x05,0x91,0x02,0x12,0x81,0x0f]

class SerialToNet(serial.threaded.Protocol):
    """serial->socket"""

    buff = []
    
    def __init__(self):
        self.socket = None

    def __call__(self):
        return self

    def data_received(self, data):
        if self.socket is not None:
            for x in data:
                self.buff.append(ord(x))
                if ord(x) == 0x0f:
                    self.process_data_frame(self.buff)
                    self.buff = []
            #data_hex = ','.join('{:02x}'.format(ord(x)) for x in data)
            #logger.debug('data_received hex string %s\n' % data_hex)
            #self.socket.sendall(data)
    
    def process_data_frame(self,data_frame):
        data_hex = ','.join('{:02x}'.format(x) for x in data_frame)
        logger.info('recv data frame: %s' % data_hex)
        if len(data_frame) < 6:
            logger.warning('data frame length invalid, ignore')
        else:
            post_url = ''
            event_type = ''
            
            if cmp(data_frame[:len(YALE_DATA_UNLOCK_BY_PIN)],YALE_DATA_UNLOCK_BY_PIN) == 0:
                logger.info('DDL event => unlock by pin code')
                post_url = settings.YALE_EVENT_HTTP_POST_NOTIFY_URL_ROOT + 'unlock/pin'
                event_type = 'unlock'
                
            if cmp(data_frame[:len(YALE_DATA_UNLOCK_BY_IBUTTON)],YALE_DATA_UNLOCK_BY_IBUTTON) == 0:
                logger.info('DDL event => unlock by pin code')
                post_url = settings.YALE_EVENT_HTTP_POST_NOTIFY_URL_ROOT + 'unlock/ibutton'
                event_type = 'unlock'

            if cmp(data_frame[:len(YALE_DATA_UNLOCK_BY_FINGERPRINT)],YALE_DATA_UNLOCK_BY_FINGERPRINT) == 0:
                logger.info('DDL event => unlock by pin code')
                post_url = settings.YALE_EVENT_HTTP_POST_NOTIFY_URL_ROOT + 'unlock/fingerprint'
                event_type = 'unlock'

            if cmp(data_frame[:len(YALE_DATA_UNLOCK_BY_CARD)],YALE_DATA_UNLOCK_BY_CARD) == 0:
                logger.info('DDL event => unlock by pin code')
                post_url = settings.YALE_EVENT_HTTP_POST_NOTIFY_URL_ROOT + 'unlock/card'
                event_type = 'unlock'

            if cmp(data_frame[:len(YALE_DATA_ALARM_INTRUDER)],YALE_DATA_ALARM_INTRUDER) == 0:
                logger.info('DDL event => unlock by pin code')
                post_url = settings.YALE_EVENT_HTTP_POST_NOTIFY_URL_ROOT + 'alarm/intruder'
                event_type = 'alarm'

            if cmp(data_frame[:len(YALE_DATA_ALARM_DAMAGE)],YALE_DATA_ALARM_DAMAGE) == 0:
                logger.info('DDL event => unlock by pin code')
                post_url = settings.YALE_EVENT_HTTP_POST_NOTIFY_URL_ROOT + 'alarm/damage'
                event_type = 'alarm'

            if cmp(data_frame[:len(YALE_DATA_ALARM_FIRE)],YALE_DATA_ALARM_FIRE) == 0:
                logger.info('DDL event => unlock by pin code')
                post_url = settings.YALE_EVENT_HTTP_POST_NOTIFY_URL_ROOT + 'alarm/fire'
                event_type = 'alarm'
                
            if cmp(data_frame[:len(YALE_STATE_LOCKED)],YALE_STATE_LOCKED) == 0:
                logger.info('DDL status => locked')
                post_url = settings.YALE_EVENT_HTTP_POST_NOTIFY_URL_ROOT + 'status/locked'
                event_type = 'status'
                
            if cmp(data_frame[:len(YALE_STATE_UNLOCKED)],YALE_STATE_UNLOCKED) == 0:
                logger.info('DDL status => unlocked')
                post_url = settings.YALE_EVENT_HTTP_POST_NOTIFY_URL_ROOT + 'status/unlocked'
                event_type = 'status'
                
            if post_url != '':
                r = requests.get(post_url)
                if r.status_code == 200:
                    logger.info('DDL event %s http post notify to url %s' % (event_type,post_url))
                else:
                    logger.warning('DDL event %s http post fail with url %s' % (event_type,post_url))

def sck_cmd_handler(ser, cmd):
    data = []
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

    

if __name__ == '__main__':  # noqa
    import argparse

    parser = argparse.ArgumentParser(
        description='Simple Serial to Network (TCP/IP) redirector.',
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
        default=7777)

    exclusive_group.add_argument(
        '-c', '--client',
        metavar='HOST:PORT',
        help='make the connection as a client, instead of running a server',
        default=False)

    args = parser.parse_args()

    # connect to serial port
    #ser = serial.serial_for_url(args.SERIALPORT, do_not_open=True)
    ser = serial.rs485.RS485()
    ser.port = args.SERIALPORT
    ser.baudrate = args.BAUDRATE
    ser.parity = args.parity
    ser.rtscts = args.rtscts
    ser.xonxoff = args.xonxoff
    ser.rs485_mode = serial.rs485.RS485Settings()

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

    ser_to_net = SerialToNet()
    serial_worker = serial.threaded.ReaderThread(ser, ser_to_net)
    serial_worker.start()

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
                #~ client_socket.settimeout(5)
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
                        else:
                            sck_cmd_handler(ser,data)
#                         if data == '\r\n':
#                             logger.debug('send door status check command\n')
#                             data = bytearray([0x05,0x91,0x01,0x11,0x81,0x0f])                             
#                             data_hex = ','.join('{:02x}'.format(x) for x in data)
#                             logger.debug('client_socket.recv: %s\n' % data_hex)
#                             ser.write(data)                 # get a bunch of bytes and send them
                    except socket.error as msg:
                        if args.develop:
                            raise
                        logger.error('ERROR: {}\n'.format(msg))
                        # probably got disconnected
                        break
            except KeyboardInterrupt:
                intentional_exit = True
                raise
            except socket.error as msg:
                if args.develop:
                    raise
                logger.error('ERROR: {}\n'.format(msg))
            finally:
                ser_to_net.socket = None
                logger.info('Disconnected\n')
                client_socket.close()
                if args.client and not intentional_exit:
                    time.sleep(5)  # intentional delay on reconnection as client
    except KeyboardInterrupt:
        pass

    logger.info('\n--- exit ---\n')
    serial_worker.stop()
