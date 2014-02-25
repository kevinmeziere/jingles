'use strict';

angular.module('fifoApp').factory('wiggle', function ($resource, $http, $cacheFactory, $q) {

    var endpoint;
    function setEndpoint(url) {

        var path = '/api/0.1.0/';

        //The port : needs to be escaped to \\:
        if (url.split(':').length>2)
            endpoint = url.replace(/:([^:]*)$/,'\\:'+'$1') + path;
        else
            endpoint = url + path;

        setUpServices();

        //Howl endpoint.
        var tmp = url || (window.location.protocol + '//' + window.location.host);
        Config.howl = Config.howl || tmp.replace(/^http/, "ws") + "/howl";
        Config.endpoint = endpoint;
    }

    var is_empty = function(obj) {

        // null and undefined are empty
        if (obj == null) return true;
        // Assume if it has a length property with a non-zero value
        // that that property is correct.
        if (obj.length && obj.length > 0) return false;
        if (obj.length === 0) return true;

        for (var key in obj) {
            if (hasOwnProperty.call(obj, key)) return false;
        }

        return true;
    }

    var addListFunctions = function() {
        /* Response with list of strings are not $resource friendly..
           https://groups.google.com/forum/#!msg/angular/QjhN9-UeBVM/UjSgc5CNDqMJ 
           Only auth.js seems to be using this...
        */
        ['hypervisors', 'vms'].forEach(function(resource) {
          services[resource].list = function(cb, error) {
              return $http.get(endpoint + resource)
                  .success(cb)
                  .error(function(data) {
                      error && error(data);
                  })
          };
        })
    }

    /* Add metadata helpers in the resources */
    var addMetadataFunctions = function() {
        
        ['hypervisors', 'orgs', 'vms', 'networks', 'ipranges', 'datasets', 'packages', 'users', 'sessions', 'groups', 'dtrace'].forEach(function(resource) {

            /* Resources that has put may save metadata, i.e. PUT vms/metadata/jingles {locked: true} */
            if (services[resource].put) {
                services[resource].prototype.mdata_set = function(obj, cb) {
                    var id = this.uuid,
                    that = this;
                    if (is_empty(obj))
                        return;
                    return services[resource].put({id: id, controller: 'metadata', controller_id: 'jingles'}, obj, function() {
                        Object.keys(obj).forEach(function(k) {
                            if (!that.metadata) that.metadata = {}
                            if (!that.metadata.jingles) that.metadata.jingles = {}
                            that.metadata.jingles[k] = obj[k]
                            cb && cb(obj)
                        })
                    })
                }
            }
            /* Metadata get helper */
            services[resource].prototype.mdata = function(key) {
                var m = this.metadata
                return m && m.jingles && m.jingles[key]
            }
        });
    }

    /* Add additional vm data, like the dataset, package etc */
    var additionalVmData = function(vm) {

      /* No extra call if controller is pressent or no sane vm */
      // if (obj.controller || !vm.config) { <-- controller?...
      if (!vm.config) {
          // vm.uuid = obj.id
          return;
      }

      if (vm.config.dataset)
        vm.config._dataset = services.datasets.get({id: vm.config.dataset})

      if (vm.package)
        vm._package = services.packages.get({id: vm.package})

      if (vm.owner)
        vm._owner = services.orgs.get({id: vm.owner})

      if (vm.hypervisor)
        vm._hypervisor = services.hypervisors.get({id: vm.hypervisor})

      return vm;
    }

    var hashFromArray = function(array) {
      var h = {}
      //All objects returned from wiggle, has 'uuid' as its id, except datasets.
      array.forEach(function(o) {
        h[o.uuid||o.dataset] = o
      })
      return h
    }

    //Interceptor that transform add hash object into an array
    var toHash = {
      response: function(res) {
        res.resource.hash = hashFromArray(res.resource)
        return res.resource;
      }
    }

    //Initialize the caches.
    $cacheFactory('datasets')
    $cacheFactory('networks')

    var controller_layout = '/:id/:controller/:controller_id/:controller_id1/:controller_id2/:controller_id3';
    function setUpServices() {
        services.sessions = $resource(endpoint + 'sessions/:id',
                                      {id: '@id'},
                                      {get: {method: 'GET', interceptor: {response: userInterceptor}},
                                       login: {method: 'POST', interceptor: {response: userInterceptor}}});
        services.users = $resource(endpoint + 'users' + controller_layout,
                                   {id: '@id',
                                    controller: '@controller',
                                    controller_id: '@controller_id',
                                    controller_id1: '@controller_id1',
                                    controller_id2: '@controller_id2',
                                    controller_id3: '@controller_id3'},
                                   {put: {method: 'PUT'},
                                    grant: {method: 'PUT'},
                                    revoke: {method: 'DELETE'},
                                    create: {method: 'POST'},
                                    delete: {method: 'DELETE'},
                                    query: {method: 'GET', isArray: true, headers: {'x-full-list': true}},
                                    queryFull: {method: 'GET', isArray: true, headers: {'x-full-list': true}, interceptor: {

                                      response: function(res) {

                                        res.resource.forEach(function(el) {
                                          el._groups = el.groups.map(function(g) {return services.groups.get({id: g})})
                                          el._orgs = el.orgs.map(function(o) {return services.orgs.get({id: o})})
                                        })

                                        // res.resource.hash = hashFromArray(res.resource)

                                        return res.resource;
                                      }

                                    }},
                                  });
        services.groups = $resource(endpoint + 'groups' + controller_layout,
                                    {id: '@id',
                                     controller: '@controller',
                                     controller_id: '@controller_id',
                                     controller_id1: '@controller_id1',
                                     controller_id2: '@controller_id2',
                                     controller_id3: '@controller_id3'},
                                    {put: {method: 'PUT'},
                                     get: {method: 'GET', cache: true},
                                     grant: {method: 'PUT'},
                                     revoke: {method: 'DELETE'},
                                     create: {method: 'POST'},
                                     delete: {method: 'DELETE'},
                                     query: {method: 'GET', isArray: true, headers: {'x-full-list': true}},
                                   });
        services.orgs = $resource(endpoint + 'orgs' + controller_layout,
                                  {id: '@id',
                                   controller: '@controller',
                                   controller_id: '@controller_id',
                                   controller_id1: '@controller_id1',
                                   controller_id2: '@controller_id2',
                                   controller_id3: '@controller_id3'},
                                  {put: {method: 'PUT'},
                                   get: {method: 'GET', cache: true},
                                   grant: {method: 'PUT'},
                                   revoke: {method: 'DELETE'},
                                   create: {method: 'POST'},
                                   delete: {method: 'DELETE'},
                                   query: {method: 'GET', isArray: true, headers: {'x-full-list': true}}
                                 });
        services.cloud = $resource(endpoint + 'cloud/:controller', {controller: '@controller'});
        services.hypervisors = $resource(endpoint + 'hypervisors/:id/:controller/:controller_id',
                                         {id: '@id', controller: '@controller', controller_id: '@controller_id'},
                                         {put: {method: 'PUT'},
                                          delete: {method: 'DELETE'},
                                          query: {method: 'GET', isArray: true, headers: {'x-full-list': true}},
                                          queryFull: {method: 'GET', isArray: true, headers: {'x-full-list': true}, interceptor: toHash}
                                        });
        services.vms = $resource(endpoint + 'vms/:id/:controller/:controller_id',
                                 {id: '@id', controller: '@controller', controller_id: '@controller_id'},
                                 {put: {method: 'PUT'},
                                  get: {method: 'GET', interceptor: {
                                    response: function(res) {
                                      return additionalVmData(res.resource)
                                    }
                                  }},
                                  query: {method: 'GET', isArray: true, headers: {'x-full-list': true}},
                                  queryFull: {method: 'GET', isArray: true, headers: {'x-full-list': true}, interceptor: {
                                    response: function(res) {
                                      res.resource.forEach(additionalVmData)
                                      res.resource.hash = hashFromArray(res.resource)
                                      return res.resource;
                                    }
                                  }}
                                });
        services.ipranges = $resource(endpoint + 'ipranges/:id',
                                      {id: '@id'},
                                      {create: {method: 'POST'},
                                       get: {method: 'GET', cache: true},
                                       delete: {method: 'DELETE'},
                                       query: {method: 'GET', isArray: true, headers: {'x-full-list': true}}});
        services.networks = $resource(endpoint + 'networks' + controller_layout,
                                      {id: '@id',
                                       controller: '@controller',
                                       controller_id: '@controller_id',
                                       controller_id1: '@controller_id1',
                                       controller_id2: '@controller_id2'},
                                      {put: {method: 'PUT', 
                                             interceptor: {
                                                response: function(res) {
                                                  $cacheFactory.get('networks').remove(endpoint + 'networks/' + res.resource.id)
                                                }
                                             }
                                      },
                                       create: {method: 'POST'},
                                       get: {method: 'GET', cache: $cacheFactory.get('networks')},
                                       getFull: {method: 'GET', cache: $cacheFactory.get('networks'), interceptor: {
                                        response: function(res) {
                                          res.resource._ipranges = res.resource.ipranges && res.resource.ipranges.map(function(d) {return services.ipranges.get({id: d})})
                                          return res.resource;
                                        }
                                       }},
                                       delete: {method: 'DELETE', 
                                          interceptor: {
                                            response: function(res) {
                                              //We dont know the id of the network that was deleted, so just delete the whole cache
                                              $cacheFactory.get('networks').removeAll()
                                            }
                                          }
                                       },
                                       query: {method: 'GET', isArray: true, headers: {'x-full-list': true}},
                                       queryFull: {method: 'GET', isArray: true, headers: {'x-full-list': true}, interceptor: toHash}
                                     });
        services.datasets = $resource(endpoint + 'datasets/:id',
                                      {id: '@id'},
                                      {import: {method: 'POST'},
                                       get: {method: 'GET', cache: $cacheFactory.get('datasets')},
                                       put: {method: 'PUT', interceptor: {
                                        response: function(res) {
                                          $cacheFactory.get('datasets').remove(endpoint + 'datasets/' + res.resource.id)
                                        }
                                       }},
                                       query: {method: 'GET', isArray: true, headers: {'x-full-list': true}},
                                     });
        services.packages = $resource(endpoint + 'packages/:id',
                                      {id: '@id'},
                                      {create: {method: 'POST'},
                                       get: {method: 'GET', cache: true},
                                       delete: {method: 'DELETE'},
                                       query: {method: 'GET', isArray: true, headers: {'x-full-list': true}}});
        services.dtrace = $resource(endpoint + 'dtrace/:id',
                                    {id: '@id'},
                                    {create: {method: 'POST'},
                                     delete: {method: 'DELETE'},
                                     query: {method: 'GET', isArray: true, headers: {'x-full-list': true}},
                                   });

        addListFunctions();
        addMetadataFunctions();
    }

    //About interceptor's:
    //Using interceptor to *full* the object with aditional data comming from a different request.
    //When you return a promise (to wait until the additional request finishes), the $resource callback
    //will return that promise instead of the original $resource. Ref: https://github.com/angular/angular.js/blob/master/src/ngResource/resource.js#L501
    //To make this explicit, and to make it not a surprise for dev's, will define getFull instead of overriding the default 'get'

    //Add _group object to the user...
    var userInterceptor = function(res) {

        var user = res.resource;
        user._groups = {};
        // return user;
        if (!user.groups) return user;

        var groupCalls = user.groups.map(function(id) {
            return services.groups.get({id: id}).$promise;
        })

        return $q.all(groupCalls)
            .then(function(res) {
                res.forEach(function(r) {user._groups[r.uuid] = r});
                return user})
            //Ignore error comming from GET on the groups. i.e. 403's...
            .catch(function(res) {
                return user;
            })
    }

    var services = {}
    if (Config.backends && Config.backends[0] && Config.backends[0].endpoint) {
        setEndpoint(Config.backends[0].endpoint);
    } else {
        setEndpoint(''); //start pointing to current backend
    };
    services.setEndpoint = setEndpoint;

    return services;
});
