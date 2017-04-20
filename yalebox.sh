#!/bin/bash -x

source /usr/share/yalebox/bin/activate
cd /usr/share/yalebox/src
python yalesmartlock.py /dev/ttyUSB0

