// Display pass for Phosphor Trails
#version 150

in vec2 v_texCoord;
out vec4 fragColor;

uniform vec2      u_resolution;
uniform float     u_time;
uniform vec3      u_backgroundColor;
uniform sampler2D u_simState;

uniform float u_ioBrightness;

void main() {
    // Read accumulated trails (v_fbUV matches GL texel layout for correct FBO readback)
    vec3 trails = texture(u_simState, v_fbUV).rgb;
    vec3 color = u_backgroundColor + trails;

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
