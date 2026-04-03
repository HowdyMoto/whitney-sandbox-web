let _gl: WebGL2RenderingContext | null = null;
let _canvas: HTMLCanvasElement | null = null;
let _width = 0;
let _height = 0;

export function initWebGL(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error('WebGL2 not supported');

  // Enable float texture rendering (needed for bloom HDR FBOs)
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_half_float_linear');

  _gl = gl;
  _canvas = canvas;

  resizeCanvas();

  const observer = new ResizeObserver(() => resizeCanvas());
  observer.observe(canvas);

  return gl;
}

export function resizeCanvas(): void {
  if (!_canvas || !_gl) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = _canvas.getBoundingClientRect();
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);

  if (_canvas.width !== w || _canvas.height !== h) {
    _canvas.width = w;
    _canvas.height = h;
    _gl.viewport(0, 0, w, h);
  }

  _width = w;
  _height = h;
}

export function getGL(): WebGL2RenderingContext {
  if (!_gl) throw new Error('WebGL2 not initialized');
  return _gl;
}

export function getWidth(): number { return _width; }
export function getHeight(): number { return _height; }
export function getDpr(): number { return window.devicePixelRatio || 1; }

// Logical (CSS) dimensions
export function getLogicalWidth(): number {
  return _canvas ? _canvas.getBoundingClientRect().width : _width;
}
export function getLogicalHeight(): number {
  return _canvas ? _canvas.getBoundingClientRect().height : _height;
}
