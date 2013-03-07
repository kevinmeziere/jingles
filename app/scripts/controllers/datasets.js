'use strict';

fifoApp.controller('DatasetsCtrl', function($scope, wiggle, status, datasetsat, howl) {

    $scope.datasets = {}

    $scope.import = function(dataset) {
        var url = $scope.url
        if (dataset)
            url = 'http://datasets.at/datasets/' + dataset.uuid;

        wiggle.datasets.import({},
                               {url: url},
                               function(r) {
                                   var uuid = r.dataset;
                                   howl.join(uuid);
                                   $scope.datasets[uuid] = r;
                               });
    };

    $scope.$on('progress', function(e, msg) {
        $scope.$apply(function() {
            $scope.datasets[msg.channel].imported = msg.message.data.imported;
        });
    })

    $scope.show = function() {
        wiggle.datasets.list(function (ids) {

            ids.length > 0 && status.update('Loading datasets', {total: ids.length})

            ids.forEach(function(id) {
                howl.join(id);

                $scope.datasets[id] = {}
                wiggle.datasets.get({id: id},
                                    function success(res) {
                                        if (res) $scope.datasets[id] = addFields(res)
                                        status.update('Loading datasets', {add: 1})
                                    },
                                    function error (res) {
                                        //Maybe we should not even show the dataset?
                                        $scope.datasets[id] = {dataset: id}
                                        status.update('Loading datasets', {add: 1})
                                    }
                                   )

            })
            datasetsat.datasets.list(function (data) {
                $scope.datasetsat = data.map(function(e) {
                    if ($scope.datasets[e.uuid]) {
                        e.imported = true;
                    } else {
                        e.imported = false;
                    }
                    return e;
                });
            });

        })
    }

    $scope.show()

    var addFields = function(ds) {
        ds._nets = (ds.networks || []).map(function(e) { return e.name + ': ' + e.description}).join(", ");
        return ds;
    }
});
