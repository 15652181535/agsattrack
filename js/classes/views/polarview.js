/*
Copyright 2012 Alex Greenland

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
 */
 
/* Options for JSHint http://www.jshint.com/ 
* NOTE: JSHint does not like
* var x = (0.5 + (az * _xstep)) | 0;
* It produces an Unexpected use of '|'. Error
* The | 0 is a much faster way to get an int from a float rather than use Math.floor
* 
* Last Checked: 19/01/2013
*
*/
/*jshint bitwise: true*/
/*global AGSatTrack, AGIMAGES, AGVIEWS, AGSETTINGS, AGUTIL, Konva, requestAnimFrame */
  
var AGPOLARVIEW = function(element) {
	'use strict';
    
	var _render = false;
    var _stage;
	var _mousePos = {
		x : 0,
		y : 0,
		el : 0,
		az : 0,
		show : false
	};
	var _width;
	var _height;
	var _degperpixel;
	var _margin = 40;
	var _stepx;
	var _stepy;
	var _cx;
	var _cy;
	var _radius;
	var _twoPi = 2 * Math.PI;
	var _halfMargin;
	var _de2ra = 0.0174532925;
    var _showPlanets = false;
    var _images = [];
    var _element;
    var _backgroundLayer;
    var _objectLayer;
    var _satLayer;
    var _planetLayer;
    var _orbitLayer;
    var _arrowLayer;
    var _infoLayer;
    var _mutualLayer;
    var _mousePosTextAz;
    var _mousePosTextEl;
    var _naflag = false;
    var _mode;
    var _singleSat = null;
    var _passToShow = null;
    var _colours = AGSETTINGS.getViewSettings('polar').colours;
        
    /**
    * Set the parent element for this view.    
    */
    if (typeof element === 'undefined') {
        _element = 'polar';    
    } else {
        _element = element;
    }
    
    /**
    * Resize the view. if no width or heig is specified then it is derived
    * from the parent (_element) element.
    * 
    * @param width Width of view in Pixels
    * @param height Height of view in Pixels
    */
    function resize(width, height) {
        if (typeof width === 'undefined' || typeof height === 'undefined') {
            var parent = jQuery('#'+_element);
            width = parent.width();
            height = parent.height();
        }

        if (width !== 0 && height !== 0) {
            _stage.width(width);
            _stage.height(height);
            drawBackground();
            drawPolarView();
        }          
    }

    jQuery(document).bind('agsattrack.polaroptionsupdated', function(event, options) {
        _colours = options.colours;
        drawPolarView();
    });
    	
    /**
     * Listen for an event telling us a new set of data is available
     */
    jQuery(document).bind('agsattrack.updatesatdata', function(event) {
        if (_render && _mode !== AGVIEWS.modes.SINGLE) {
            drawPolarView();
        }
    });
	
		
	/**
	 * Listen for an event telling us a new set of elements were loaded
	 */
	jQuery(document).bind('agsattrack.tlesloaded', function(event, group) {
        if (_render) {
            _satLayer.clear();
        }
	});

    jQuery(document).bind('agsattrack.newfollowing', function(event, group) {
        if (_render && _mode !== AGVIEWS.modes.SINGLE) {
            drawBackground();
            drawPolarView();
        }
    });
    
    jQuery(document).bind('agsattrack.showplanets',
            function(e, state) {
                if (AGSETTINGS.getHaveCanvas() && _render) {
                    _showPlanets = state;
                    drawPlanets();
                }
            });
            
    jQuery(document).bind('agsattrack.settingssaved',
            function(e, observer) {
                if (_render) {
                    drawBackground();
                    drawPolarView();
                }
            });             

    /**
    * Convert the current postiion of the mouse to Azimuth and
    * Elevation.
    */
	function convertMousePos() {
		var rel = _radius - Math.sqrt((_mousePos.x - _cx) * (_mousePos.x - _cx) + (_mousePos.y - _cy) * (_mousePos.y - _cy));
		_mousePos.el = 90.0 * rel / _radius;
		if (_mousePos.x >= _cx) {
			/* 1. and 2. quadrant */
			_mousePos.az = Math.atan2(_mousePos.x - _cx, _cy - _mousePos.y) / _de2ra;
		} else {
			/* 3 and 4. quadrant */
			_mousePos.az = 360 + Math.atan2(_mousePos.x - _cx, _cy - _mousePos.y) / _de2ra;
		}

		if (_mousePos.az < 0 || _mousePos.el < 0) {
			_mousePos.show = false;
		} else {
			_mousePos.show = true;
		}
	}
    
    /**
    * Convert an Azimuth and Elevation to screen coordinates
    * 
    * @param az The Azimuth
    * @param el The Elevation
    * 
    * @returns {Object}
    */
	function convertAzEltoXY(az, el) {

		if (el < 0) {
			return {
				x : 0,
				y : 0
			};
		}

		/* convert angles to radians */
		az = _de2ra * az;
		el = _de2ra * el;

		/* radius @ el */
		var rel = _radius - (2 * _radius * el) / Math.PI;

		var x = (_cx + rel * Math.sin(az));
		var y = (_cy - rel * Math.cos(az));

		return {
			x : x,
			y : y
		};
	}

    /**
    * Setup the basic dimensions we need to be able
    * to draw the Polar view.
    */
	function setDimensions() {

		_height = _stage.getHeight();
		_width = _stage.getWidth();

		var size;

		if (_height > _width) {
			size = _width;
		} else {
			size = _height;
		}
		size = size - (_margin * 2);
		_cx = (0.5 + (_width / 2)) | 0;
		_cy = (0.5 + (_height / 2)) | 0;
		_radius = (0.5 + (size / 2)) | 0;
		_halfMargin = (0.5 + (_margin / 2)) | 0;
	}

	function drawBackground() {
		var _circle;
		var _line;
		var _text;
        var radius;
        
		setDimensions();
		_backgroundLayer.removeChildren();

       var res =  _backgroundLayer.add(new Konva.Rect({
            x: 0,
            y: 0,
            width: _width,
            height: _height,
            fill: '#' + _colours.background
        }));

        _backgroundLayer.add(new Konva.Circle({
            x : _cx,
            y : _cy,
            radius : _radius + _halfMargin,
            stroke : '#' + _colours.border,
            strokeWidth : 10,
            fill: '#' + _colours.background 
        })); 
        
		_circle = new Konva.Circle({
			x : _cx,
			y : _cy,
			radius : _radius,
            fillLinearGradientStartPoint: {x: 0, y: -10},
            fillLinearGradientEndPoint: {x: 0, y: 100},
            fillLinearGradientColorStops: [0, '#' + _colours.gradientstart, 1, '#' + _colours.gradientend],
		});
                    
		_circle.on('mouseout', function() {
			_mousePos.show = false;
		});
		_backgroundLayer.add(_circle);

        
        for (var i=0; i<90; i+=15) {
            radius = (0.5 + (_radius * (i/90))) | 0;
            _backgroundLayer.add(new Konva.Circle({
                x : _cx,
                y : _cy,
                radius : radius,
                stroke : '#' + _colours.grid,
                strokeWidth : 1
            }));  
        }
          
        /**
        * we only use single mode on the passes view so for now just reduce
        * the font size for this case.
        */
        var elFontSize = 10;
        if (_mode === AGVIEWS.modes.SINGLE) {
            elFontSize = 8;    
        }
        for (i=15; i<90; i+=15) {
            radius = (0.5 + (_radius * (i/90))) | 0;
            _backgroundLayer.add(new Konva.Text({
                x : _cx - radius - 7,
                y : _cy + 5,
                text : (90-i) + 'º',
                fontSize : elFontSize,
                fontFamily : 'Verdana',
                fill : '#' + _colours.degcolour
            }));
            _backgroundLayer.add(new Konva.Text({
                x : _cx + radius - 7,
                y : _cy + 5,
                text : (90-i) + 'º',
                fontSize : elFontSize,
                fontFamily : 'Verdana',
                fill : '#' + _colours.degcolour
            }));                 
        }
        
        var long=0;
        var len;
        for (i=0; i< 360; i+= 5) {
            
            var rad = i * (Math.PI/180);
            
            if (long) {
                len = 10;    
            } else {
                len = 15;
            }
            long = !long;
            
            var startX = (_cx + (_radius + 15 - len) * Math.cos( rad )) | 0;
            var startY =  (_cy + (_radius + 15 - len)  * Math.sin( rad )) | 0;
            
            var endX =  (_cx + (_radius + 15) * Math.cos( rad )) | 0;  
            var endY =  (_cy + (_radius + 15) * Math.sin( rad )) | 0;
            
            _backgroundLayer.add(new Konva.Line({
                points : [ startX, startY, endX, endY ],
                stroke : '#' + _colours.grid,
                strokeWidth : 1
            }));           
        }      

		_backgroundLayer.add(new Konva.Line({
            points : [ _cx - _radius - _halfMargin + 5, _cy,
                    _cx + _radius + _halfMargin - 5, _cy ],
            stroke : '#' + _colours.grid,
            strokeWidth : 1
        }));

		_backgroundLayer.add(new Konva.Line({
            points : [ _cx, _cy - _radius - _halfMargin + 5, _cx,
                    _cy + _radius + _halfMargin - 5 ],
            stroke : '#' + _colours.grid,
            strokeWidth : 1
        }));

		_backgroundLayer.add(new Konva.Text({
            x : _cx + 5,
            y : 30,
            text : 'N',
            fontSize : 15,
            fontFamily : 'Verdana',
            fill : '#' + _colours.text
        }));

		_backgroundLayer.add(new Konva.Text({
            x : _cx + _radius ,
            y : _radius + _halfMargin,
            text : 'E',
            fontSize : 15,
            fontFamily : 'Verdana',
            fill : '#' + _colours.text
        }));

		_backgroundLayer.add(new Konva.Text({
            x : _cx - _radius - 10,
            y : _radius + _halfMargin,
            text : 'W',
            fontSize : 15,
            fontFamily : 'Verdana',
            fill : '#' + _colours.text
        }));

		_backgroundLayer.add(new Konva.Text({
            x : _cx + 8,
            y : _height - _halfMargin - 30,
            text : 'S',
            fontSize : 15,
            fontFamily : 'Verdana',
            fill : '#' + _colours.text
        }));

        elFontSize = 14;
        if (_mode === AGVIEWS.modes.SINGLE) {
            elFontSize = 10;    
        }        
		_backgroundLayer.add(new Konva.Text({
            x : 10,
            y : 5,
            text : 'Mouse Position',
            fontSize : elFontSize,
            fontFamily : 'Verdana',
            fill : '#' + _colours.text
        }));
        
		_backgroundLayer.add(new Konva.Text({
            x : 10,
            y : 30,
            text : 'Azimuth:',
            fontSize : elFontSize,
            fontFamily : 'Verdana',
            fill : '#' + _colours.text
        }));
        
		_backgroundLayer.add(new Konva.Text({
            x : 10,
            y : 50,
            text : 'Elevation:',
            fontSize : elFontSize,
            fontFamily : 'Verdana',
            fill : '#' + _colours.text
        }));

		_backgroundLayer.draw();
        
        _mutualLayer.removeChildren();
        if (AGSETTINGS.getMutualObserverEnabled()) {
            var observer = AGSatTrack.getObserver(AGOBSERVER.types.HOME);
            var mutualObserver = AGSatTrack.getObserver(AGOBSERVER.types.MUTUAL);
            
            var az = AGUTIL.getBearing(observer.getLat(),observer.getLon(), mutualObserver.getLat(), mutualObserver.getLon());
            var pos = convertAzEltoXY(az, 0);
            _mutualLayer.add(new Konva.Circle({
                x : pos.x,
                y : pos.y,
                radius : 5,
                stroke : 'red',
                strokeWidth : 1
            }));             
            _mutualLayer.add(new Konva.Text({
                x : pos.x,
                y : pos.y,
                text : mutualObserver.getName(),
                fontSize : 10,
                fontFamily : 'Verdana',
                fill : 'white'
            }));
        }
        _mutualLayer.draw();        
	}
    
    function drawMousePos() {
        if (_mousePos.show) {
            _mousePosTextAz.setText(_mousePos.az.toFixed(0));
            _mousePosTextEl.setText(_mousePos.el.toFixed(0));
            _naflag = false;
            _objectLayer.draw();
        } else {
            if (_naflag === false) {
                _mousePosTextAz.setText('N/A');
                _mousePosTextEl.setText('N/A');
                _naflag = true;
                _objectLayer.draw();
            }
        }        
    }
    

    /**
    * Draw the main polar view. This function plots the satellites, orbits
    * and satellite information.
    */
	function drawPolarView() {
        switch (_mode) {
            case AGVIEWS.modes.DEFAULT:
                _drawDefaultView();  
                break;
                
            case AGVIEWS.modes.SINGLE:
                _drawSingleView();
                break;
                
            case AGVIEWS.modes.PREVIEW:
                _drawPreviewView();
                break;                
        }
    }
    
    function _drawPreviewView() {
        setDimensions();
        drawBackground();
        drawInfoLayer();              
    }    
    
    /**
    * Draw a single satellite. We allow the layers to be cleared each time
    * so that if no satelite is selected the view is cleared.
    */
    function _drawSingleView() {

        setDimensions();
        
        drawPlanets();
        drawInfoLayer();
        
        _orbitLayer.removeChildren();
        _arrowLayer.removeChildren();        
        _satLayer.removeChildren();
        if (_singleSat !== null) {            
            plotSatellite(_singleSat);
        }
        _orbitLayer.draw();
        _satLayer.draw();
        _arrowLayer.draw();              
    }
    
    
    function _drawDefaultView() {
		setDimensions();
        
        drawPlanets();
        drawInfoLayer();
        
        _orbitLayer.removeChildren();
        _arrowLayer.removeChildren();
        _satLayer.removeChildren();
		var satellites = AGSatTrack.getSatellites();
		jQuery.each(satellites, function(index, satellite) {        
            plotSatellite(satellite);
		});
        _orbitLayer.draw();
		_satLayer.draw();
        _arrowLayer.draw();         
	}
    
    function plotSatellite(satellite) {
        var pos;
        
        if (satellite.isDisplaying()) {

            var az = satellite.get('azimuth');
            var el = satellite.get('elevation');


            /**
            * If satellite is selected draw its orbit
            */
            if (satellite.getSelected()) {
                var move = false;
                var prePoints = [];                        
                var points = [];                        
                var postPoints = [];                        
                var max = {az:0, el:0};
                var maxPrev = {az:0, el:0};
                var aostime = null;
                var okToDraw = true;
                var aosPos = {x:0, y:0};
                var passData = null;
                var pass = null;
                var haveAos = false;
                var drawStartArrow = false;
                var drawMaxArrow = false;
                var drawEndArrow = false;
                
                if (_passToShow !== null) {
                    var observer = AGSatTrack.getObserver(AGOBSERVER.types.HOME);
                    var mutualObserver = AGSatTrack.getObserver(AGOBSERVER.types.MUTUAL);
                    passData = satellite.getPassforTime(observer, mutualObserver, _passToShow);
                    pass = passData.pass;                       
                } else {
                    passData = satellite.getNextPass();
                    if (typeof passData === 'undefined') {
                        okToDraw = false;    
                    } else {
                        pass = passData.pass;
                    }
                }
                
                if (okToDraw) {             
                    points = []; 
                    for ( var i = 0; i < pass.length; i++) {
                        pos = convertAzEltoXY(pass[i].az, pass[i].el); 
                        if (pass[i].el >= AGSETTINGS.getAosEl()) {
                            if (points.length ===0) {
                                prePoints.push(pos.x | 0);
                                prePoints.push(pos.y | 0);
                                aosPos.x  = pos.x;
                                aosPos.y = pos.y;                                   
                            }
                            points.push(pos.x | 0);
                            points.push(pos.y | 0);

                            if (aostime === null) {
                                aostime = pass[i].date;
                            }
                            
                            haveAos = true;
                            
                            if (!drawStartArrow) {
                                drawArrow(prePoints, 'red');
                                drawStartArrow = true;
                            }
                        } else {
                            if (!haveAos) {
                                if (pass[i].el >= 0) {
                                    prePoints.push(pos.x | 0);
                                    prePoints.push(pos.y | 0);                                    
                                }
                            } else {
                                if (pass[i].el >= 0) {
                                    if (postPoints.length === 0 && points.length > 0) {
                                        postPoints.push(points[points.length-2]);
                                        postPoints.push(points[points.length-1]);
                                    }
                                    postPoints.push(pos.x | 0);
                                    postPoints.push(pos.y | 0);
                                    
                                    if (!drawEndArrow) {
                                        if (drawStartArrow) {
                                            drawArrow(postPoints, 'green');
                                            drawEndArrow = true; 
                                        }                                       
                                    }                                   
                                }
                            }
                        }
                        if (pass[i].el > max.el) {
                            max = pass[i];
                            if (i > 0) {
                                maxPrev = pass[i - 1];
                            }
                        }
                        
                        if (haveAos && pass[i].el < 0) {
                            break;
                        }
                    }

                    if (prePoints.length > 0) {
                        _orbitLayer.add(new Konva.Line({
                                points: prePoints,
                                stroke: 'red',
                                strokeWidth: 1,
                                lineCap: 'round',
                                lineJoin: 'round'
                            })
                        );
                    }
                                                                    
                    if (points.length > 0) {
                        _orbitLayer.add(new Konva.Line({
                                points: points,
                                stroke: 'green',
                                strokeWidth: 2,
                                lineCap: 'round',
                                lineJoin: 'round'
                            })
                        );
                    }
                    
                    if (postPoints.length > 0) {
                        _orbitLayer.add(new Konva.Line({
                                points: postPoints,
                                stroke: 'red',
                                strokeWidth: 1,
                                lineCap: 'round',
                                lineJoin: 'round'
                            })
                        );
                    }                        
                                            
                }
                
                var maxArray = [];
                pos = convertAzEltoXY(maxPrev.az, maxPrev.el); 
                maxArray.push(pos.x | 0);
                maxArray.push(pos.y | 0);                
                pos = convertAzEltoXY(max.az, max.el); 
                maxArray.push(pos.x | 0);
                maxArray.push(pos.y | 0);
                drawArrow(maxArray, 'green');
                
                /**
                * If satellite is selected but NOT visible then add a text label
                * at the max elevation.
                */
                if (el < AGSETTINGS.getAosEl()) {
                    if (aostime !== null) {
                        pos = convertAzEltoXY(max.az, max.el);
                        _orbitLayer.add(new Konva.Text({
                            x : pos.x + 5,
                            y : pos.y + 5,
                            text : satellite.getName(),
                            fontSize : 8,
                            fontFamily : 'Verdana',
                            fill : '#eee'
                        }));  
                    }                   
                } 
                if (max.az !== 0 && max.el !== 0 && okToDraw) {
                    pos = convertAzEltoXY(max.az, max.el);
                    _orbitLayer.add(new Konva.Circle({
                        x : pos.x,
                        y : pos.y,
                        radius : 2,
                        stroke : 'red',
                        strokeWidth : 1,
                        fill: 'red' 
                    })); 
                }                         

                
                if (aosPos.x !== 0 && aosPos.y !== 0) {
                    _orbitLayer.add(new Konva.Text({
                        x : aosPos.x,
                        y : aosPos.y,
                        text : 'AoS: ' + AGUTIL.shortdatetime(passData.aosTime),
                        fontSize : 8,
                        fontFamily : 'Verdana',
                        fill : '#eee'
                    }));                         
                }
                
                if (postPoints.length !== 0) {
                    _orbitLayer.add(new Konva.Text({
                        x : postPoints[0],
                        y : postPoints[1],
                        text : 'LoS: ' + AGUTIL.shortdatetime(passData.losTime),
                        fontSize : 8,
                        fontFamily : 'Verdana',
                        fill : '#eee'
                    }));                          
                }                   
            }

            if (el > AGSETTINGS.getAosEl()) {
                                
                pos = convertAzEltoXY(az, el);
                var _style = 'normal';

                if (satellite.getSelected()) {
                    _style = 'bold';
                }

                _satLayer.add(new Konva.Text({
                    x : pos.x - 8,
                    y : pos.y - 20,
                    text : satellite.getName(),
                    fontSize : 10,
                    fontFamily : 'Verdana',
                    fontStyle : _style,
                    fill : 'white'
                }));

                var sat;
                sat = new Konva.Image({
                    x : pos.x - 8,
                    y : pos.y - 8,
                    image : AGIMAGES.getImage('satellite116'),
                    width : 16,
                    height : 16,
                    id : satellite.getCatalogNumber()
                });
                sat.on('mouseup', function(e) {
                    var selected = this.getId();
                    jQuery(document).trigger('agsattrack.satclicked', {
                        catalogNumber : selected
                    });
                });
                _satLayer.add(sat);
            }

        }
    }
    
    function drawArrow(points, colour) {
        var fromx = points[points.length-4];
        var fromy = points[points.length-3];

        var tox = points[points.length-2];
        var toy = points[points.length-1];
        
        var headlen = 10;
        var angle = Math.atan2(toy-fromy,tox-fromx);

        var line = new Konva.Line({
            points: [fromx, fromy, tox, toy, tox-headlen*Math.cos(angle-Math.PI/6),toy-headlen*Math.sin(angle-Math.PI/6),tox, toy, tox-headlen*Math.cos(angle+Math.PI/6),toy-headlen*Math.sin(angle+Math.PI/6)],
            stroke: colour
        });
        _arrowLayer.add(line);         
    }
    
    function drawInfoLayer() {
        var nextEvent;
        
        _infoLayer.removeChildren();
        var following = AGSatTrack.getFollowing();
        if (following !== null) {
            
            if (following.isGeostationary()) {
                if (following.get('elevation') > 0) {
                    nextEvent = {
                        eventlong : 'Satellite is geostationary',
                        time: 'N/A'    
                    }; 
                } else {
                    nextEvent = {
                        eventlong : 'Geostationary Not Visible',
                        time: 'N/A'    
                    }; 
                }
            } else {
                nextEvent = following.getNextEvent(true);
            }

            var elFontSize = 14;
            if (_mode === AGVIEWS.modes.SINGLE) {
                elFontSize = 8;    
            }
            if (_mode !== AGVIEWS.modes.SINGLE) {             
                 _infoLayer.add(new Konva.Text({
                    x : 10,
                    y : _height-50,
                    text : 'Information for ' + following.getName(),
                    fontSize : elFontSize,
                    fontFamily : 'Verdana',
                    fill : '#ccc'
                 }));
            }
             _infoLayer.add(new Konva.Text({
                x : 10,
                y : _height-35,
                text : 'Next Event: ' + nextEvent.eventlong,
                fontSize : elFontSize,
                fontFamily : 'Verdana',
                fill : '#ccc'
             }));
             
             _infoLayer.add(new Konva.Text({
                x : 10,
                y : _height-21,
                text : 'Event Time: ' + nextEvent.time,
                fontSize : elFontSize,
                fontFamily : 'Verdana',
                fill : '#ccc'
             }));             
                               
        }
        _infoLayer.draw();        
    }
    
    function drawPlanets() {
        var image;
        
        setDimensions();
        _planetLayer.removeChildren();    
        if (_showPlanets) {        
            var _planets = AGSatTrack.getPlanets();
            jQuery.each(_planets, function(index, planet) {
                if (planet.alt > 0) {
                    var pos = convertAzEltoXY(planet.az, planet.alt);            
                    if (planet.name.toLowerCase() === 'moon') {
                        image = AGIMAGES.getImage(planet.name.toLowerCase()+planet.phase,'generic');                        
                    } else {
                        image = AGIMAGES.getImage(planet.name.toLowerCase(),'generic');
                    }

                    _planetLayer.add(new Konva.Image({
                        x : pos.x - 8,
                        y : pos.y - 8,
                        image : image,
                        width : 32,
                        height : 32,
                        id : -1
                    }));
                    
                    _planetLayer.add(new Konva.Text({
                        x : pos.x,
                        y : pos.y - 20,
                        text : planet.name,
                        fontSize : 10,
                        fontFamily : 'Verdana',
                        fill : 'white'
                    }));                  
                }
            });
        }
        _planetLayer.draw();        
    }
    
    var _debugCounter=0;
	function animate() {
		if (_render && _mode !== AGVIEWS.modes.PREVIEW) {
            if (AGSETTINGS.getDebugLevel() > 0) {
                _debugCounter++;
                if (_debugCounter > 100) {
                    _debugCounter = 0;
                    console.log('Polar Animate');
                }
            }
			drawMousePos();
            requestAnimFrame(animate);
        }
		
	}

	return {
		startRender : function() {
			_render = true;
            resize();
            animate();
			//_satLayer.clear();
            drawPolarView();
		},

		stopRender : function() {
			_render = false;
		},

        destroy : function() {
            _render = false;
            jQuery('#'+_element).html('');    
        },
        resizeView : function(width, height) {
            resize(width, height);     
        },
        
        reDraw : function() {
            drawPolarView();    
        },
             
		init : function(mode) {     
            if (typeof mode === 'undefined') {
                mode = AGVIEWS.modes.DEFAULT;    
            }
            _mode = mode;
            
            _stage = new Konva.Stage({
                container : _element,
                width : 1000,
                height : 600
            });

            _backgroundLayer = new Konva.Layer();
            _stage.add(_backgroundLayer);

            _objectLayer = new Konva.Layer();
            _stage.add(_objectLayer);

            _satLayer = new Konva.Layer();
            _stage.add(_satLayer);

            _planetLayer = new Konva.Layer();
            _stage.add(_planetLayer);

            _arrowLayer = new Konva.Layer();
            _stage.add(_arrowLayer); 
                        
            _orbitLayer = new Konva.Layer();
            _stage.add(_orbitLayer);

            _infoLayer = new Konva.Layer();
            _stage.add(_infoLayer);
                
            _mutualLayer = new Konva.Layer();
            _stage.add(_mutualLayer);
                
            _stage.on('mousemove', function() {
                _mousePos = _stage.getPointerPosition();
                convertMousePos();
            });
            
            var elFontSize = 14;
            if (_mode === AGVIEWS.modes.SINGLE) {
                elFontSize = 10;    
            }               
            _mousePosTextAz = new Konva.Text({
                x : 80,
                y : 30,
                text : 'N/A',
                fontSize : elFontSize,
                fontFamily : 'Calibri',
                fill : '#' + _colours.text
            });
            _objectLayer.add(_mousePosTextAz);

            _mousePosTextEl = new Konva.Text({
                x : 80,
                y : 50,
                text : 'N/A',
                fontSize : elFontSize,
                fontFamily : 'Calibri',
                fill : '#' + _colours.text
            });
            _objectLayer.add(_mousePosTextEl);
                
		},
        
        reset : function() {
            _singleSat = null;
            _passToShow = null;
            drawPolarView();
        },
        
        setSingleSat : function(satellite) {
            _singleSat = satellite;
        },
        
        setPassToShow : function(passToShow) {
            _passToShow = passToShow;
        },
        
        setPreviewColours : function(colours) {
            _colours = colours;
            drawPolarView();    
        }
	};
};