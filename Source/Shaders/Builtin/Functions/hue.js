    //This file is automatically rebuilt by the Cesium build process.
    /*global define*/
    define(function() {
    "use strict";
    return "vec3 czm_hue(vec3 rgb, float adjustment)\n\
{\n\
const mat3 toYIQ = mat3(0.299,     0.587,     0.114,\n\
0.595716, -0.274453, -0.321263,\n\
0.211456, -0.522591,  0.311135);\n\
const mat3 toRGB = mat3(1.0,  0.9563,  0.6210,\n\
1.0, -0.2721, -0.6474,\n\
1.0, -1.107,   1.7046);\n\
vec3 yiq = toYIQ * rgb;\n\
float hue = atan(yiq.z, yiq.y) + adjustment;\n\
float chroma = sqrt(yiq.z * yiq.z + yiq.y * yiq.y);\n\
vec3 color = vec3(yiq.x, chroma * cos(hue), chroma * sin(hue));\n\
return toRGB * color;\n\
}\n\
";
});