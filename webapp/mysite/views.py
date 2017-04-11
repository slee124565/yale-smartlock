from django.views.generic import View
from django.http import HttpResponse

class SeudoEventHandlerView(View):
    
    def get(self, request, evt, param, *args, **kwargs):
        
        return HttpResponse('%s-%s' % (evt,param))
    