#!/usr/bin/env python
'''\nCreate formated JSON file from input JSON file path
Usage: python json_file_dumps -f <JSON_FILE_PATH>
Arguments:
    -f, --file    JSON file path to be formatted
'''

import os, django, sys, getopt, json

proj_root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'gui')
sys.path.append(proj_root)
os.environ['DJANGO_SETTINGS_MODULE'] = 'smartmirror.settings'
django.setup()

import logging
logger = logging.getLogger(__name__)

def usage():
    print(sys.exit(__doc__))

def main(argv):
    try:
        opts, _ = getopt.getopt(argv[1:],'hf:',['file='])
    except getopt.GetoptError:
        usage()
        
    src_file = ''
    for opt, arg in opts:
        if opt == '-h':
            usage()
        elif opt in ('-f','--file'):
            src_file = arg

    if src_file is None:
        usage()
    else:
        dest_file = os.path.join(proj_root,'json.txt')
        logger.info('script %s:' % argv[0])
        logger.info('source json file: %s' % src_file)
        logger.info('result json file: %s' % dest_file)
        with open(src_file,'r') as fh:
            formated_json = json.loads(fh.read())
        with open(dest_file,'w') as fh:
            fh.write(json.dumps(formated_json,indent=2))

if __name__ == '__main__':
    main(sys.argv)
