#!/bin/bash -x

PATH=/usr/share/yalesmartlock/webapp:$PATH
source /usr/share/smirror/bin/activate
cd /usr/share/yalesmartlock/webapp
python yale/transmitter_socket_server.py /dev/ttyUSB0

