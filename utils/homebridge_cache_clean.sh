#!/bin/bash -x

#-> remove homebridge temp files
sudo rm -rf /var/homebridge/persist /var/homebridge/accessories

sudo systemctl restart homebridge
