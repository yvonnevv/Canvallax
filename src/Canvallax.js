  'use strict';

  var win = window,
      doc = document,
      root = doc.documentElement,
      body = doc.body,
      noop = function(){},
      requestAnimationFrame = win.requestAnimationFrame || win.mozRequestAnimationFrame || win.webkitRequestAnimationFrame || win.msRequestAnimationFrame || win.oRequestAnimationFrame || function(callback){ win.setTimeout(callback, 20); };

  // Exit if browser does not support canvas
  if ( !win.CanvasRenderingContext2D ) { win.Canvallax = function(){ return false; }; return false; }

  var Canvallax,
      // Default options
      defaults = {

        tracker: false,
        // (`false`||Canvallax.TrackScroll()||Canvallax.TrackPointer())
        // Tracker instance to tie coordinates to scroll, pointer, etc.
        // Set to false if you want to control the scene's X and Y manually, perfect for animating with GSAP.

        x: 0,
        // (Number)
        // Starting x position.
        // If `tracking` is enabled, this will be overridden on render.

        y: 0,
        // (Number)
        // Starting y position.
        // If `tracking` is enabled, this will be overridden on render.

        canvas: undefined,
        // (Node)
        // Use Canvallax on an existing canvas node, otherwise one is created.

        className: '',
        // (String)
        // Classes to add to the canvas, in addition to the 'canvallax' class automatically added.

        parent: body,
        // (Node)
        // Canvas is prepended to document.body by default. Override with your own Node if you want it within a certain container.

        elements: undefined,
        // (Array)
        // Collection of elements to render on the Canvallax instance

        animating: true,
        // (Boolean)
        // Update canvas every requestAnimationFrame call.

        fullscreen: true,
        // (Boolean)
        // Set the canvas width and height to the size of the window, and update on window resize.

        width: null,
        // (Number)
        // Canvas width, overridden if `fullscreen` is true.

        height: null,
        // (Number)
        // Canvas height, overridden if `fullscreen` is true.

        preRender: noop,
        // (Function)
        // Callback before elements are rendered.

        postRender: noop
        // (Function)
        // Callback after elements are rendered.

      };

  function extend(target) {
    target = target || {};

    var length = arguments.length,
        i = 1;

    if ( arguments.length === 1 ) {
      target = this;
      i = 0;
    }

    for ( ; i < length; i++ ) {
      if ( !arguments[i] ) { continue; }
      for ( var key in arguments[i] ) {
        if ( arguments[i].hasOwnProperty(key) ) { target[key] = arguments[i][key]; }
      }
    }

    return target;
  }

  function createClass(){

    function C(options) {
      if ( !(this instanceof C) ) { return new C(options); }

      extend(this,options);
      this.init.apply(this,arguments);

      return this;
    }

    var args = [],
        parent = null,
        fn = C.prototype = { init: noop },
        length = arguments.length,
        i = 0;

    for ( ; i < length; i++ ) { args[i] = arguments[i]; }

    if ( length > 1 && args[0].prototype ) {
      parent = args[0];
      args[0] = args[0].prototype;
      fn._parent = parent;
    }

    args.unshift(fn);
    extend.apply(fn, args);

    fn.constructor = C;

    return C;
  }

////////////////////////////////////////

  function zIndexSort(a,b){
    var sort = ( a.zIndex === b.zIndex ? 0 : a.zIndex < b.zIndex ? -1 : 1 );
    return sort || ( a.z === b.z ? 0 : a.z < b.z ? -1 : 1 );
  }

  function clone(properties){
    var props = extend({}, this, properties);
    return new this.constructor(props);
  }

  win.Canvallax = Canvallax = createClass({

    add: function(el){
      var elements = el && el.length ? el : arguments,
          len = elements.length,
          i = 0;

      for ( ; i < len; i++ ) {
        if ( elements[i] ) { // Prevent adding `false` or `undefined` elements
          this.elements.push(elements[i]);
        }
      }

      return this.sort();
    },

    init: function(options){
      var C = this;

      Canvallax.extend(this,defaults,options);

      C.canvas = C.canvas || doc.createElement('canvas');
      C.canvas.className += ' canvallax ' + C.className;

      C.parent.insertBefore(C.canvas, C.parent.firstChild);

      if ( C.fullscreen ) {
        C.resizeFullscreen();
        win.addEventListener('resize', C.resizeFullscreen.bind(C));
      } else {
        C.resize(C.width,C.height);
      }

      C.ctx = C.canvas.getContext('2d');

      C.elements = [];
      if ( options && options.elements ) { C.addElements(options.elements); }

      C.damping = ( !C.damping || C.damping < 1 ? 1 : C.damping );

      C.render();

      return this;
    },

    play: function(){
      this.animating = true;
      return this.render();
    },

    pause: function(){
      this.animating = false;
      return this;
    },

    remove: function(element){
      var index = this.elements.indexOf(element);

      if ( index > -1 ) {
        this.elements.splice(index, 1);
      }

      return this;
    },

    transformOrigin: 'center center',
    // (String)
    // Where the element's transforms will occur, two keywords separated by a space.
    // The default of `'center center'` means that `rotation` and `scale` transforms will occur from the center of the element.
    // The first keyword can be `left`, `center` or `right` cooresponding to the appropriate horizontal position.
    // The second keyword can be `top`, `center` or `bottom` cooresponding to the appropriate vertical position.

    getTransformPoint: function(){
      var el = this,
          point = el._transformPoint,
          origin;

      if ( !point || el._transformOrigin !== el.transformOrigin ) {

        origin = el.transformOrigin.split(' ');
        point = {
          x: 0,
          y: 0
        };

        if ( (!el.width && !el.height) && !el.radius ) { return point; }

        if ( origin[0] === 'center' ) {
          point.x += ( el.width ? el.width / 2 : el.radius );
        } else if ( origin[0] === 'right' ) {
          point.x += ( el.width ? el.width : el.radius * 2 );
        }

        if ( origin[1] === 'center' ) {
          point.y += ( el.height ? el.height / 2 : el.radius );
        } else if ( origin[1] === 'bottom' ) {
          point.y += ( el.height ? el.height : el.radius * 2 );
        }

        el._transformOrigin = el.transformOrigin;
        el._transformPoint = point;
      }

      return point;
    },

    render: function() {
      var C = this,
          i = 0,
          len = C.elements.length,
          pos,
          scale;

      if ( C.animating ) { C.animating = requestAnimationFrame(C.render.bind(C)); }

      C.ctx.clearRect(0, 0, C.width, C.height);

      if ( C.tracker ) {
        pos = C.tracker.render(C);
        // Allow tracker to set many properties.
        for ( var key in pos ) {
          if ( pos.hasOwnProperty(key) ) { C[key] = pos[key]; }
        }
      }

      C.ctx.save();
      }

      C.preRender(C.ctx);

      for ( ; i < len; i++ ){
        C.ctx.save();
        C.elements[i].render(C.ctx,C);
        C.ctx.restore();
      }

      C.postRender(C.ctx);
      C.ctx.restore();

      return this;
    },

    resize: function(width,height){
      this.width = this.canvas.width = width;
      this.height = this.canvas.height = height;
      return this;
    },

    resizeFullscreen: function() {
      return this.resize(win.innerWidth,win.innerHeight);
    },

    sort: function(){
      this.elements.sort(zIndexSort);
      return this;
    },

    clone: clone
  });

  // Utility functions outside of prototype.
  Canvallax.createClass = createClass;
  Canvallax.extend = extend;
  Canvallax.clone = clone;