export class FBO {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
  private gl: WebGL2RenderingContext;
  private readonly useFloat: boolean;

  constructor(gl: WebGL2RenderingContext, width: number, height: number, float = false) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.useFloat = float;

    // Enable float rendering extension if needed
    if (float) {
      gl.getExtension('EXT_color_buffer_float');
      gl.getExtension('EXT_color_buffer_half_float');
    }

    this.texture = gl.createTexture()!;
    this.framebuffer = gl.createFramebuffer()!;
    this.allocate(width, height);
  }

  private allocate(width: number, height: number): void {
    const gl = this.gl;
    const internalFormat = this.useFloat ? gl.RGBA16F : gl.RGBA8;
    const type = this.useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind(): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.viewport(0, 0, this.width, this.height);
  }

  unbind(): void {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.allocate(width, height);
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteFramebuffer(this.framebuffer);
  }
}
