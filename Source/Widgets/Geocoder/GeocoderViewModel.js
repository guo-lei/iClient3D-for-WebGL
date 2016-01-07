/*global define*/
define([
        '../../Core/BingMapsApi',
        '../../Core/Cartesian3',
        '../../Core/defaultValue',
        '../../Core/defined',
        '../../Core/defineProperties',
        '../../Core/DeveloperError',
        '../../Core/Event',
        '../../Core/jsonp',
        '../../Core/Matrix4',
        '../../Core/Rectangle',
        '../../ThirdParty/knockout',
        '../../ThirdParty/when',
        '../createCommand',
        '../../DataSources/GeoJsonDataSource'
    ], function(
        BingMapsApi,
        Cartesian3,
        defaultValue,
        defined,
        defineProperties,
        DeveloperError,
        Event,
        jsonp,
        Matrix4,
        Rectangle,
        knockout,
        when,
        createCommand,
        GeoJsonDataSource) {
    "use strict";

    /**
     * The view model for the {@link Geocoder} widget.
     * @alias GeocoderViewModel
     * @constructor
     *
     * @param {Object} options Object with the following properties:
     * @param {Scene} options.scene The Scene instance to use.
     * @param {String} [options.url='//dev.virtualearth.net'] The base URL of the Bing Maps API.
     * @param {String} [options.key] The Bing Maps key for your application, which can be
     *        created at {@link https://www.bingmapsportal.com}.
     *        If this parameter is not provided, {@link BingMapsApi.defaultKey} is used.
     *        If {@link BingMapsApi.defaultKey} is undefined as well, a message is
     *        written to the console reminding you that you must create and supply a Bing Maps
     *        key as soon as possible.  Please do not deploy an application that uses
     *        this widget without creating a separate key for your application.
     * @param {Number} [options.flightDuration] The duration of the camera flight to an entered location, in seconds.
     */
    var GeocoderViewModel = function(options) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(options) || !defined(options.scene)) {
            throw new DeveloperError('options.scene is required.');
        }
        //>>includeEnd('debug');

        this._url = defaultValue(options.url, '//dev.virtualearth.net/');
        if (this._url.length > 0 && this._url[this._url.length - 1] !== '/') {
            this._url += '/';
        }

        this._key = BingMapsApi.getKey(options.key);
        this._scene = options.scene;
        this._flightDuration = options.flightDuration;
        this._searchText = '';
        this._isSearchInProgress = false;
        this._geocodeInProgress = undefined;
        this._complete = new Event();

        var that = this;
        this._searchCommand = createCommand(function() {
            if (that.isSearchInProgress) {
                cancelGeocode(that);
            } else {
                //geocode(that);
                geocodeSuperMapOL(that);
            }
        });
        this._viewer = options.viewer;

        knockout.track(this, ['_searchText', '_isSearchInProgress']);

        /**
         * Gets a value indicating whether a search is currently in progress.  This property is observable.
         *
         * @type {Boolean}
         */
        this.isSearchInProgress = undefined;
        knockout.defineProperty(this, 'isSearchInProgress', {
            get : function() {
                return this._isSearchInProgress;
            }
        });

        /**
         * Gets or sets the text to search for.  The text can be an address, or longitude, latitude,
         * and optional height, where longitude and latitude are in degrees and height is in meters.
         *
         * @type {String}
         */
        this.searchText = undefined;
        knockout.defineProperty(this, 'searchText', {
            get : function() {
                if (this.isSearchInProgress) {
                    return 'Searching...';
                }
                return this._searchText;
            },
            set : function(value) {
                //>>includeStart('debug', pragmas.debug);
                if (typeof value !== 'string') {
                    throw new DeveloperError('value must be a valid string.');
                }
                //>>includeEnd('debug');

                this._searchText = value;
            }
        });

        /**
         * Gets or sets the the duration of the camera flight in seconds.
         * A value of zero causes the camera to instantly switch to the geocoding location.
         * The duration will be computed based on the distance when undefined.
         *
         * @type {Number|undefined}
         * @default undefined
         */
        this.flightDuration = undefined;
        knockout.defineProperty(this, 'flightDuration', {
            get : function() {
                return this._flightDuration;
            },
            set : function(value) {
                //>>includeStart('debug', pragmas.debug);
                if (defined(value) && value < 0) {
                    throw new DeveloperError('value must be positive.');
                }
                //>>includeEnd('debug');

                this._flightDuration = value;
            }
        });
    };

    defineProperties(GeocoderViewModel.prototype, {
        /**
         * Gets the Bing maps url.
         * @memberof GeocoderViewModel.prototype
         *
         * @type {String}
         */
        url : {
            get : function() {
                return this._url;
            }
        },

        /**
         * Gets the Bing maps key.
         * @memberof GeocoderViewModel.prototype
         *
         * @type {String}
         */
        key : {
            get : function() {
                return this._key;
            }
        },

        /**
         * Gets the event triggered on flight completion.
         * @memberof GeocoderViewModel.prototype
         *
         * @type {Event}
         */
        complete : {
            get : function() {
                return this._complete;
            }
        },

        /**
         * Gets the scene to control.
         * @memberof GeocoderViewModel.prototype
         *
         * @type {Scene}
         */
        scene : {
            get : function() {
                return this._scene;
            }
        },

        /**
         * Gets the Command that is executed when the button is clicked.
         * @memberof GeocoderViewModel.prototype
         *
         * @type {Command}
         */
        search : {
            get : function() {
                return this._searchCommand;
            }
        }
    });

    function updateCamera(viewModel, position) {
        if (viewModel._flightDuration === 0) {
            viewModel._scene.camera.setView({position: position});
            viewModel._complete.raiseEvent();
        } else {
            viewModel._scene.camera.flyTo({
                destination : position,
                complete: function() {
                    viewModel._complete.raiseEvent();
                },
                duration : viewModel._flightDuration,
                endTransform : Matrix4.IDENTITY,
                convert : false
            });
        }
    }

    function geocode(viewModel) {
        var query = viewModel.searchText;

        if (/^\s*$/.test(query)) {
            //whitespace string
            return;
        }

        // If the user entered (longitude, latitude, [height]) in degrees/meters,
        // fly without calling the geocoder.
        var splitQuery = query.match(/[^\s,\n]+/g);
        if ((splitQuery.length === 2) || (splitQuery.length === 3)) {
            var longitude = +splitQuery[0];
            var latitude = +splitQuery[1];
            var height = (splitQuery.length === 3) ? +splitQuery[2] : 300.0;

            if (!isNaN(longitude) && !isNaN(latitude) && !isNaN(height)) {
                updateCamera(viewModel, Cartesian3.fromDegrees(longitude, latitude, height));
                return;
            }
        }
        viewModel._isSearchInProgress = true;

      /*  var testUrl = 'http://www.supermapol.com/iserver/services/location-china/rest/locationanalyst/China/geocoding.jsonp';
        var promise = jsonp(testUrl, {
            parameters : {
                city : query,
                address : '超图大厦'
            },
            callbackParameterName : 'callback'
        });*/
        var promise = jsonp(viewModel._url + 'REST/v1/Locations', {
            parameters : {
                query : query,
                key : viewModel._key

            },
            callbackParameterName : 'jsonp'
        });


        var geocodeInProgress = viewModel._geocodeInProgress = when(promise, function(result) {
            if (geocodeInProgress.cancel) {
                return;
            }
            viewModel._isSearchInProgress = false;

            if (result.resourceSets.length === 0) {
                viewModel.searchText = viewModel._searchText + ' (not found)';
                return;
            }

            var resourceSet = result.resourceSets[0];
            if (resourceSet.resources.length === 0) {
                viewModel.searchText = viewModel._searchText + ' (not found)';
                return;
            }

            var resource = resourceSet.resources[0];

            viewModel._searchText = resource.name;
            var bbox = resource.bbox;
            var south = bbox[0];
            var west = bbox[1];
            var north = bbox[2];
            var east = bbox[3];
            var rectangle = Rectangle.fromDegrees(west, south, east, north);

            var camera = viewModel._scene.camera;
            var position = camera.getRectangleCameraCoordinates(rectangle);
            if (!defined(position)) {
                // This can happen during a scene mode transition.
                return;
            }

            updateCamera(viewModel, position);
        }, function() {
            if (geocodeInProgress.cancel) {
                return;
            }

            viewModel._isSearchInProgress = false;
            viewModel.searchText = viewModel._searchText + ' (error)';
        });
    }
    function geocodeSuperMapOL(viewModel){
        var query = viewModel.searchText;
        if (/^\s*$/.test(query)) {
            //whitespace string
            return;
        }
        // If the user entered (longitude, latitude, [height]) in degrees/meters,
        // fly without calling the geocoder.
        var splitQuery = query.match(/[^\s,\n]+/g);
        if ((splitQuery.length === 2) || (splitQuery.length === 3)) {
            var longitude = +splitQuery[0];
            var latitude = +splitQuery[1];
            var height = (splitQuery.length === 3) ? +splitQuery[2] : 300.0;

            if (!isNaN(longitude) && !isNaN(latitude) && !isNaN(height)) {
                updateCamera(viewModel, Cartesian3.fromDegrees(longitude, latitude, height));
                return;
            }
        }
        viewModel._isSearchInProgress = true;

        //地理编码检索服务
        //var testUrl = 'http://www.supermapol.com/iserver/services/location-china/rest/locationanalyst/China/geocoding.jsonp';

        //本地POI检索服务
        var testUrl = 'http://www.supermapol.com/iserver/services/localsearch/rest/searchdatas/China/poiinfos.jsonp';
        var promise = jsonp(testUrl, {
            parameters : {
                keywords : query,
                city : "\u5317\u4eac\u5e02",
                location : '',
                radius : '',
                leftLocation : '',
                rightLocation : '',
                pageSize : 50,
                pageNum : 1
            },
            callbackParameterName : 'callback',
            jsonpName : 'callBack'
        });
        var geocodeInProgress = viewModel._geocodeInProgress = when(promise, function(result) {
            if (geocodeInProgress.cancel) {
                return;
            }
            viewModel._isSearchInProgress = false;

            if (result.length === 0 || result.totalHints === 0) {
                viewModel.searchText = viewModel._searchText + ' (not found)';
                return;
            }

            var datasource = processGeoJsonObject(result);
            viewModel._viewer.dataSources.removeAll();
            viewModel._viewer.dataSources.add(datasource);
            var resource = result.poiInfos[0];
             viewModel._searchText = resource.name;
             var location = resource.location;
             var position = Cartesian3.fromDegrees(location.x,location.y,1000);
             var camera = viewModel._scene.camera;
             if (!defined(position)) {
             // This can happen during a scene mode transition.
                return;
             }
             updateCamera(viewModel, position);

            /*var resource = result[0];
            viewModel._searchText = resource.name;
            var location = resource.location;
            var position = Cartesian3.fromDegrees(location.x,location.y,1000);
            var camera = viewModel._scene.camera;
            if (!defined(position)) {
                // This can happen during a scene mode transition.
                return;
            }
            updateCamera(viewModel, position);*/
        }, function() {
            if (geocodeInProgress.cancel) {
                return;
            }

            viewModel._isSearchInProgress = false;
            viewModel.searchText = viewModel._searchText + ' (error)';
        });
    }
    function processGeoJsonObject(jsonObj){
        var result = {
            type : 'FeatureCollection',
            features : []
        };
        var poiInfos = jsonObj.poiInfos;
        for(var i = 0,j = poiInfos.length;i < j;i++){
            var obj = poiInfos[i];
            var address = obj.address;
            var location = obj.location;
            var name = obj.name;
            var tel = obj.telephone;
            var feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        location.x,
                        location.y
                    ]
                },
                "properties": {
                    "title": name,
                    "marker-color": "#B9EB14",
                    'tel' : tel,
                    'address' : address
                }
            };
            result.features.push(feature);
        }
        var jsonDataSource = new GeoJsonDataSource().loadPoiJsonData(result);
        return jsonDataSource;
    }
    function cancelGeocode(viewModel) {
        viewModel._isSearchInProgress = false;
        if (defined(viewModel._geocodeInProgress)) {
            viewModel._geocodeInProgress.cancel = true;
            viewModel._geocodeInProgress = undefined;
        }
    }

    return GeocoderViewModel;
});