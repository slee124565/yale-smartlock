from .base import *

try:
    from .local import *
    print('import local settings')
except:
    pass
