(function (exports) {
    'use strict';

    function parse(path, debug = true) {

        debug = 'log';

        const paramCounts = {
            // Move (absolute & relative)
            0x4D: 2,  // 'M'
            0x6D: 2,  // 'm'

            // Arc
            0x41: 7,  // 'A'
            0x61: 7,  // 'a'

            // Cubic Bézier
            0x43: 6,  // 'C'
            0x63: 6,  // 'c'

            // Horizontal Line
            0x48: 1,  // 'H'
            0x68: 1,  // 'h'

            // Line To
            0x4C: 2,  // 'L'
            0x6C: 2,  // 'l'

            // Quadratic Bézier
            0x51: 4,  // 'Q'
            0x71: 4,  // 'q'

            // Smooth Cubic Bézier
            0x53: 4,  // 'S'
            0x73: 4,  // 's'

            // Smooth Quadratic Bézier
            0x54: 2,  // 'T'
            0x74: 2,  // 't'

            // Vertical Line
            0x56: 1,  // 'V'
            0x76: 1,  // 'v'

            // Close Path
            0x5A: 0,  // 'Z'
            0x7A: 0   // 'z'
        };

        const commandSet = new Set([

            0x4D,
            0x6D,

            // Arc
            0x41,
            0x61,

            // Cubic Bézier
            0x43,
            0x63,

            // Horizontal Line
            0x48,
            0x68,

            // Line To
            0x4C,
            0x6C,

            // Quadratic Bézier
            0x51,
            0x71,

            // Smooth Cubic Bézier
            0x53,
            0x73,

            // Smooth Quadratic Bézier
            0x54,
            0x74,

            // Vertical Line
            0x56,
            0x76,

            // Close Path
            0x5A,
            0x7A,
        ]);

        const SPECIAL_SPACES = new Set([
            0x1680, 0x180E, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
            0x2007, 0x2008, 0x2009, 0x200A, 0x202F, 0x205F, 0x3000, 0xFEFF
        ]);

        function isSpace(ch) {
            return (ch === 0x0A) || (ch === 0x0D) || (ch === 0x2028) || (ch === 0x2029) || // Line terminators
                // White spaces or comma
                (ch === 0x002C) || (ch === 0x20) || (ch === 0x09) || (ch === 0x0B) || (ch === 0x0C) || (ch === 0xA0) ||
                (ch >= 0x1680 && SPECIAL_SPACES.has(ch) >= 0);
        }

        function isCommandType(code) {

            return commandSet.has(code);
        }

        let i = 0, len = path.length;
        let lastCommand = "";
        let pathData = [];
        let itemCount = -1;
        let val = '';
        let wasE = false;
        let wasSpace = false;
        let floatCount = 0;
        let valueIndex = 0;
        let maxParams = 0;
        let needsNewSegment = false;

        let hasRelatives = false;
        let hasArcs = false;
        let hasShorthands = false;
        let hasQuadratics = false;

        let relatives = new Set(['m', 'c', 'q', 'l', 'a', 't', 's', 'v', 'h']);
        let shorthands = new Set(['t', 's', 'v', 'h', 'T', 'S', 'V', 'H']);
        let quadratics = new Set(['t', 'q', 'T', 'Q']);

        let log = [];
        let feedback;

        function addSeg() {
            // Create new segment if needed before adding the minus sign
            if (needsNewSegment) {

                // sanitize implicit linetos
                if (lastCommand === 'M') lastCommand = 'L';
                else if (lastCommand === 'm') lastCommand = 'l';

                pathData.push({ type: lastCommand, values: [] });
                itemCount++;
                valueIndex = 0;
                needsNewSegment = false;

            }
        }

        function pushVal(checkFloats = false) {

            // regular value or float
            if (!checkFloats ? val !== '' : floatCount > 0) {

                // error: no first command
                if (debug && itemCount === -1) {

                    feedback = 'Pathdata must start with M command';
                    log.push(feedback);

                    // add M command to collect subsequent errors
                    lastCommand = 'M';
                    pathData.push({ type: lastCommand, values: [] });
                    maxParams = 2;
                    valueIndex = 0;
                    itemCount++;

                }

                if (lastCommand === 'A' || lastCommand === 'a') {
                    val = sanitizeArc();
                    pathData[itemCount].values.push(...val);

                } else {
                    // error: leading zeroes
                    if (debug && val[1] && val[1] !== '.' && val[0] === '0') {
                        feedback = 'Leading zeros not valid: ' + val;
                        log.push(feedback);
                    }

                    pathData[itemCount].values.push(+val);
                }

                valueIndex++;
                val = '';
                floatCount = 0;

                // Mark that a new segment is needed if maxParams is reached
                needsNewSegment = valueIndex >= maxParams;

            }

        }

        function sanitizeArc() {

            let valLen = val.length;
            let arcSucks = false;

            // large arc and sweep
            if (valueIndex === 3 && valLen === 2) {

                val = [+val[0], +val[1]];
                arcSucks = true;
                valueIndex++;
            }

            // sweep and final
            else if (valueIndex === 4 && valLen > 1) {

                val = [+val[0], +val[1]];
                arcSucks = true;
                valueIndex++;
            }

            // large arc, sweep and final pt combined
            else if (valueIndex === 3 && valLen >= 3) {

                val = [+val[0], +val[1], +val.substring(2)];
                arcSucks = true;
                valueIndex += 2;
            }

            return !arcSucks ? [+val] : val;

        }

        function validateCommand() {
            if (debug) {
                let lastCom = itemCount > 0 ? pathData[itemCount] : 0;
                let valLen = lastCom ? lastCom.values.length : 0;

                if ((valLen && valLen < maxParams) || (valLen && valLen > maxParams) || ((lastCommand === 'z' || lastCommand === 'Z') && valLen > 0)) {
                    let diff = maxParams - valLen;
                    feedback = `Pathdata commands in "${lastCommand}" (segment index: ${itemCount}) don't match allowed number of values: ${diff}/${maxParams}`;
                    log.push(feedback);
                }
            }
        }

        while (i < len) {
            let char = path[i];
            let charCode = path.charCodeAt(i);

            // New command
            if (isCommandType(charCode)) {

                // command is concatenated without whitespace
                if (val !== '') {
                    pathData[itemCount].values.push(+val);
                    valueIndex++;
                    val = '';
                }

                // check if previous command was correctly closed
                validateCommand();

                // new command type
                lastCommand = char;
                maxParams = paramCounts[charCode];
                let isM = lastCommand === 'M' || lastCommand === 'm';
                let wasClosePath = itemCount>0 && (pathData[itemCount].type === 'z' || pathData[itemCount].type === 'Z');

                // add omitted M command after Z
                if ( wasClosePath && !isM  ) {
                    pathData.push({ type: 'm', values: [0, 0]});
                    itemCount++;
                }

                pathData.push({ type: lastCommand, values: [] });
                itemCount++;

                if (!hasRelatives) hasRelatives = relatives.has(lastCommand);
                if (!hasShorthands) hasShorthands = shorthands.has(lastCommand);
                if (!hasQuadratics) hasQuadratics = quadratics.has(lastCommand);
                if (!hasArcs) hasArcs = lastCommand === 'a' || lastCommand === 'A';

                // reset counters
                wasSpace = false;
                floatCount = 0;
                valueIndex = 0;
                needsNewSegment = false;

                i++;
                continue;
            }

            // Separated by White space 
            if (isSpace(charCode)) {

                // push value
                pushVal();

                wasSpace = true;
                wasE = false;
                i++;
                continue;
            }

            // if last
            else if (i === len - 1) {

                val += char;

                // push value
                pushVal();
                wasSpace = false;
                wasE = false;

                validateCommand();
                break;
            }

            // minus or float separated
            if ((!wasE && !wasSpace && charCode === 0x2D) ||
                (!wasE && charCode === 0x2E)
            ) {

                // checkFloats changes condition for value adding
                let checkFloats = charCode === 0x2E;

                // new val
                pushVal(checkFloats);

                // new segment
                addSeg();

                // concatenated floats
                if (checkFloats) {
                    floatCount++;
                }
            }

            // regular splitting
            else {
                addSeg();
            }

            val += char;

            // e/scientific notation in value
            wasE = (charCode === 0x45 || charCode === 0x65);
            wasSpace = false;
            i++;
        }

        validateCommand();

        // return error log
        if (debug && log.length) {
            feedback = 'Invalid path data:\n' + log.join('\n');
            if (debug === 'log') {
                console.log(feedback);
            } else {
                throw new Error(feedback)
            }
        }

        pathData[0].type = 'M';

        return {
            pathData: pathData,
            hasRelatives: hasRelatives,
            hasShorthands: hasShorthands,
            hasQuadratics: hasQuadratics,
            hasArcs: hasArcs
        }

    }

    /**
     * detect suitable floating point accuracy
     * for further rounding/optimizations
     */

    function detectAccuracy(pathData) {

        // Reference first MoveTo command (M)
        let M = { x: pathData[0].values[0], y: pathData[0].values[1] };
        let p0 = { ...M };
        pathData[0].decimals = 0;
        let lastDec = 0;
        let maxDecimals = 0;

        for (let i = 1, len = pathData.length; i < len; i++) {
            let com = pathData[i];
            let { type, values } = com;

            let lastVals = values.length ? values.slice(-2) : [M.x, M.y];
            let lastX = lastVals[0];
            let lastY = lastVals[1];

            if (type === 'Z' || type === 'z') {
                lastX = M.x;
                lastY = M.y;
            }

            let w = Math.abs(p0.x - lastX);
            let h = Math.abs(p0.y - lastY);
            let dimA = (w + h) / 2 || 0;

            // Determine decimal places dynamically
            let decimals = (type !== 'Z' && type !== 'z') ? Math.ceil((1 / dimA)).toString().length + 1 : 0;

            if (dimA === 0) {

                decimals = lastDec;
            }

            else if (decimals && dimA < 0.5) {
                decimals++;
            }

            // Update previous coordinates
            p0 = { x: lastX, y: lastY };

            // Track MoveTo for closing paths
            if (type === 'M') {
                M = { x: values[0], y: values[1] };
                com.decimals = decimals;
            } else {

                // Store ideal precision for next pass
                com.decimals = decimals;

            }

            maxDecimals = decimals > maxDecimals ? decimals : maxDecimals;
            lastDec = decimals;
        }

        // set max decimal for M
        pathData[0].decimals = maxDecimals;
        return pathData
    }

    /**
     * round path data
     * either by explicit decimal value or
     * based on suggested accuracy in path data
     */
    function roundPathData(pathData, decimals = -1) {
        // has recommended decimals
        let hasDecimal = decimals == 'auto' && pathData[0].hasOwnProperty('decimals') ? true : false;

        for(let c=0, len=pathData.length; c<len; c++){
            let com=pathData[c];

            if (decimals >-1 || hasDecimal) {
                decimals = hasDecimal ? com.decimals : decimals;

                pathData[c].values = com.values.map(val=>{return val ? +val.toFixed(decimals) : val });

            }
        }    return pathData;
    }

    /*
    import {abs, acos, asin, atan, atan2, ceil, cos, exp, floor,
        log, max, min, pow, random, round, sin, sqrt, tan, PI} from '/.constants.js';
        */

    const {
        abs, acos, asin, atan, atan2, ceil, cos, exp, floor,
        log, max, min, pow, random, round, sin, sqrt, tan, PI
    } = Math;

    // get angle helper
    function getAngle(p1, p2, normalize = false) {
        let angle = atan2(p2.y - p1.y, p2.x - p1.x);
        // normalize negative angles
        if (normalize && angle < 0) angle += Math.PI * 2;
        return angle
    }

    /**
     * based on:  Justin C. Round's 
     * http://jsfiddle.net/justin_c_rounds/Gd2S2/light/
     */

    function checkLineIntersection(p1, p2, p3, p4, exact = true) {
        // if the lines intersect, the result contains the x and y of the intersection (treating the lines as infinite) and booleans for whether line segment 1 or line segment 2 contain the point
        let denominator, a, b, numerator1, numerator2;
        let intersectionPoint = {};

        try {
            denominator = ((p4.y - p3.y) * (p2.x - p1.x)) - ((p4.x - p3.x) * (p2.y - p1.y));
            if (denominator == 0) {
                return false;
            }

        } catch {
            console.log('!catch', p1, p2, 'p3:', p3, p4);
        }

        a = p1.y - p3.y;
        b = p1.x - p3.x;
        numerator1 = ((p4.x - p3.x) * a) - ((p4.y - p3.y) * b);
        numerator2 = ((p2.x - p1.x) * a) - ((p2.y - p1.y) * b);

        a = numerator1 / denominator;
        b = numerator2 / denominator;

        // if we cast these lines infinitely in both directions, they intersect here:
        intersectionPoint = {
            x: p1.x + (a * (p2.x - p1.x)),
            y: p1.y + (a * (p2.y - p1.y))
        };

        let intersection = false;
        // if line1 is a segment and line2 is infinite, they intersect if:
        if ((a > 0 && a < 1) && (b > 0 && b < 1)) {
            intersection = true;

        }

        if (exact && !intersection) {

            return false;
        }

        // if line1 and line2 are segments, they intersect if both of the above are true

        return intersectionPoint;
    }

    /**
     * get distance between 2 points
     * pythagorean theorem
     */
    function getDistance(p1, p2) {
        return sqrt(
            (p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y)
        );
    }

    function getSquareDistance(p1, p2) {
        return (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2
    }

    /**
    * Linear  interpolation (LERP) helper
    */
    function interpolate(p1, p2, t, getTangent = false) {

        let pt = {
            x: (p2.x - p1.x) * t + p1.x,
            y: (p2.y - p1.y) * t + p1.y,
        };

        if (getTangent) {
            pt.angle = getAngle(p1, p2);

            // normalize negative angles
            if (pt.angle < 0) pt.angle += PI * 2;
        }

        return pt
    }

    function pointAtT(pts, t = 0.5, getTangent = false, getCpts = false) {

        const getPointAtBezierT = (pts, t, getTangent = false) => {

            let isCubic = pts.length === 4;
            let p0 = pts[0];
            let cp1 = pts[1];
            let cp2 = isCubic ? pts[2] : pts[1];
            let p = pts[pts.length - 1];
            let pt = { x: 0, y: 0 };

            if (getTangent || getCpts) {
                let m0, m1, m2, m3, m4;
                let shortCp1 = p0.x === cp1.x && p0.y === cp1.y;
                let shortCp2 = p.x === cp2.x && p.y === cp2.y;

                if (t === 0 && !shortCp1) {
                    pt.x = p0.x;
                    pt.y = p0.y;
                    pt.angle = getAngle(p0, cp1);
                }

                else if (t === 1 && !shortCp2) {
                    pt.x = p.x;
                    pt.y = p.y;
                    pt.angle = getAngle(cp2, p);
                }

                else {
                    // adjust if cps are on start or end point
                    if (shortCp1) t += 0.0000001;
                    if (shortCp2) t -= 0.0000001;

                    m0 = interpolate(p0, cp1, t);
                    if (isCubic) {
                        m1 = interpolate(cp1, cp2, t);
                        m2 = interpolate(cp2, p, t);
                        m3 = interpolate(m0, m1, t);
                        m4 = interpolate(m1, m2, t);
                        pt = interpolate(m3, m4, t);

                        // add angles
                        pt.angle = getAngle(m3, m4);

                        // add control points
                        if (getCpts) pt.cpts = [m1, m2, m3, m4];
                    } else {
                        m1 = interpolate(p0, cp1, t);
                        m2 = interpolate(cp1, p, t);
                        pt = interpolate(m1, m2, t);
                        pt.angle = getAngle(m1, m2);

                        // add control points
                        if (getCpts) pt.cpts = [m1, m2];
                    }
                }

            }
            // take simplified calculations without tangent angles
            else {
                let t1 = 1 - t;

                // cubic beziers
                if (isCubic) {
                    pt = {
                        x:
                            t1 ** 3 * p0.x +
                            3 * t1 ** 2 * t * cp1.x +
                            3 * t1 * t ** 2 * cp2.x +
                            t ** 3 * p.x,
                        y:
                            t1 ** 3 * p0.y +
                            3 * t1 ** 2 * t * cp1.y +
                            3 * t1 * t ** 2 * cp2.y +
                            t ** 3 * p.y,
                    };

                }
                // quadratic beziers
                else {
                    pt = {
                        x: t1 * t1 * p0.x + 2 * t1 * t * cp1.x + t ** 2 * p.x,
                        y: t1 * t1 * p0.y + 2 * t1 * t * cp1.y + t ** 2 * p.y,
                    };
                }

            }

            return pt

        };

        let pt;
        if (pts.length > 2) {
            pt = getPointAtBezierT(pts, t, getTangent);
        }

        else {
            pt = interpolate(pts[0], pts[1], t, getTangent);
        }

        // normalize negative angles
        if (getTangent && pt.angle < 0) pt.angle += PI * 2;

        return pt
    }

    /**
     * get vertices from path command final on-path points
     */
    function getPathDataVertices(pathData) {
        let polyPoints = [];
        let p0 = { x: pathData[0].values[0], y: pathData[0].values[1] };

        pathData.forEach((com) => {
            let { type, values } = com;
            // get final on path point from last 2 values
            if (values.length) {
                let pt = values.length > 1 ? { x: values[values.length - 2], y: values[values.length - 1] }
                    : (type === 'V' ? { x: p0.x, y: values[0] } : { x: values[0], y: p0.y });
                polyPoints.push(pt);
                p0 = pt;
            }
        });
        return polyPoints;
    }

    /**
     *  based on @cuixiping;
     *  https://stackoverflow.com/questions/9017100/calculate-center-of-svg-arc/12329083#12329083
     */
    function svgArcToCenterParam(x1, y1, rx, ry, xAxisRotation, largeArc, sweep, x2, y2) {

        // helper for angle calculation
        const getAngle = (cx, cy, x, y) => {
            return atan2(y - cy, x - cx);
        };

        // make sure rx, ry are positive
        rx = abs(rx);
        ry = abs(ry);

        // create data object
        let arcData = {
            cx: 0,
            cy: 0,
            // rx/ry values may be deceptive in arc commands
            rx: rx,
            ry: ry,
            startAngle: 0,
            endAngle: 0,
            deltaAngle: 0,
            clockwise: sweep,
            // copy explicit arc properties
            xAxisRotation,
            largeArc,
            sweep
        };

        if (rx == 0 || ry == 0) {
            // invalid arguments
            throw Error("rx and ry can not be 0");
        }

        let shortcut = true;

        if (rx === ry && shortcut) {

            // test semicircles
            let diffX = Math.abs(x2 - x1);
            let diffY = Math.abs(y2 - y1);
            let r = diffX;

            let xMin = Math.min(x1, x2),
                yMin = Math.min(y1, y2),
                PIHalf = Math.PI * 0.5;

            // semi circles
            if (diffX === 0 && diffY || diffY === 0 && diffX) {

                r = diffX === 0 && diffY ? diffY / 2 : diffX / 2;
                arcData.rx = r;
                arcData.ry = r;

                // verical
                if (diffX === 0 && diffY) {
                    arcData.cx = x1;
                    arcData.cy = yMin + diffY / 2;
                    arcData.startAngle = y1 > y2 ? PIHalf : -PIHalf;
                    arcData.endAngle = y1 > y2 ? -PIHalf : PIHalf;
                    arcData.deltaAngle = sweep ? Math.PI : -Math.PI;

                }
                // horizontal
                else if (diffY === 0 && diffX) {
                    arcData.cx = xMin + diffX / 2;
                    arcData.cy = y1;
                    arcData.startAngle = x1 > x2 ? Math.PI : 0;
                    arcData.endAngle = x1 > x2 ? -Math.PI : Math.PI;
                    arcData.deltaAngle = sweep ? Math.PI : -Math.PI;
                }

                return arcData;
            }
        }

        /**
         * if rx===ry x-axis rotation is ignored
         * otherwise convert degrees to radians
         */
        let phi = rx === ry ? 0 : (xAxisRotation * PI) / 180;
        let cx, cy;

        let s_phi = !phi ? 0 : sin(phi);
        let c_phi = !phi ? 1 : cos(phi);

        let hd_x = (x1 - x2) / 2;
        let hd_y = (y1 - y2) / 2;
        let hs_x = (x1 + x2) / 2;
        let hs_y = (y1 + y2) / 2;

        // F6.5.1
        let x1_ = !phi ? hd_x : c_phi * hd_x + s_phi * hd_y;
        let y1_ = !phi ? hd_y : c_phi * hd_y - s_phi * hd_x;

        // F.6.6 Correction of out-of-range radii
        //   Step 3: Ensure radii are large enough
        let lambda = (x1_ * x1_) / (rx * rx) + (y1_ * y1_) / (ry * ry);
        if (lambda > 1) {
            rx = rx * sqrt(lambda);
            ry = ry * sqrt(lambda);

            // save real rx/ry
            arcData.rx = rx;
            arcData.ry = ry;
        }

        let rxry = rx * ry;
        let rxy1_ = rx * y1_;
        let ryx1_ = ry * x1_;
        let sum_of_sq = rxy1_ ** 2 + ryx1_ ** 2; // sum of square
        if (!sum_of_sq) {

            throw Error("start point can not be same as end point");
        }
        let coe = sqrt(abs((rxry * rxry - sum_of_sq) / sum_of_sq));
        if (largeArc == sweep) {
            coe = -coe;
        }

        // F6.5.2
        let cx_ = (coe * rxy1_) / ry;
        let cy_ = (-coe * ryx1_) / rx;

        /** F6.5.3
         * center point of ellipse
         */
        cx = !phi ? hs_x + cx_ : c_phi * cx_ - s_phi * cy_ + hs_x;
        cy = !phi ? hs_y + cy_ : s_phi * cx_ + c_phi * cy_ + hs_y;
        arcData.cy = cy;
        arcData.cx = cx;

        /** F6.5.5
         * calculate angles between center point and
         * commands starting and final on path point
         */
        let startAngle = getAngle(cx, cy, x1, y1);
        let endAngle = getAngle(cx, cy, x2, y2);

        // adjust end angle
        if (!sweep && endAngle > startAngle) {

            endAngle -= Math.PI * 2;
        }

        if (sweep && startAngle > endAngle) {

            endAngle = endAngle <= 0 ? endAngle + Math.PI * 2 : endAngle;
        }

        let deltaAngle = endAngle - startAngle;
        arcData.startAngle = startAngle;
        arcData.endAngle = endAngle;
        arcData.deltaAngle = deltaAngle;

        return arcData;
    }

    function getPointOnEllipse(cx, cy, rx, ry, angle, ellipseRotation = 0, parametricAngle = true, degrees = false) {

        // Convert degrees to radians
        angle = degrees ? (angle * PI) / 180 : angle;
        ellipseRotation = degrees ? (ellipseRotation * PI) / 180 : ellipseRotation;
        // reset rotation for circles or 360 degree 
        ellipseRotation = rx !== ry ? (ellipseRotation !== PI * 2 ? ellipseRotation : 0) : 0;

        // is ellipse
        if (parametricAngle && rx !== ry) {
            // adjust angle for ellipse rotation
            angle = ellipseRotation ? angle - ellipseRotation : angle;
            // Get the parametric angle for the ellipse
            let angleParametric = atan(tan(angle) * (rx / ry));
            // Ensure the parametric angle is in the correct quadrant
            angle = cos(angle) < 0 ? angleParametric + PI : angleParametric;
        }

        // Calculate the point on the ellipse without rotation
        let x = cx + rx * cos(angle),
            y = cy + ry * sin(angle);
        let pt = {
            x: x,
            y: y
        };

        if (ellipseRotation) {
            pt.x = cx + (x - cx) * cos(ellipseRotation) - (y - cy) * sin(ellipseRotation);
            pt.y = cy + (x - cx) * sin(ellipseRotation) + (y - cy) * cos(ellipseRotation);
        }
        return pt
    }

    function bezierhasExtreme(p0, cpts = [], angleThreshold = 0.05) {
        let isCubic = cpts.length === 3 ? true : false;
        let cp1 = cpts[0];
        let cp2 = isCubic ? cpts[1] : null;
        let p = isCubic ? cpts[2] : cpts[1];
        let PIquarter = Math.PI * 0.5;

        let extCp1 = false,
            extCp2 = false;

        let ang1 = getAngle(p, cp1, true);

        extCp1 = Math.abs((ang1 % PIquarter)) < angleThreshold || Math.abs((ang1 % PIquarter) - PIquarter) < angleThreshold;

        if (isCubic) {
            let ang2 = cp2 ? getAngle(cp2, p, true) : 0;
            extCp2 = Math.abs((ang2 % PIquarter)) <= angleThreshold ||
                Math.abs((ang2 % PIquarter) - PIquarter) <= angleThreshold;
        }
        return (extCp1 || extCp2)
    }

    function getBezierExtremeT(pts) {
        let tArr = pts.length === 4 ? cubicBezierExtremeT(pts[0], pts[1], pts[2], pts[3]) : quadraticBezierExtremeT(pts[0], pts[1], pts[2]);
        return tArr;
    }

    /**
     * based on Nikos M.'s answer
     * how-do-you-calculate-the-axis-aligned-bounding-box-of-an-ellipse
     * https://stackoverflow.com/questions/87734/#75031511
     * See also: https://github.com/foo123/Geometrize
     */
    function getArcExtemes(p0, values) {
        // compute point on ellipse from angle around ellipse (theta)
        const arc = (theta, cx, cy, rx, ry, alpha) => {
            // theta is angle in radians around arc
            // alpha is angle of rotation of ellipse in radians
            var cos = Math.cos(alpha),
                sin = Math.sin(alpha),
                x = rx * Math.cos(theta),
                y = ry * Math.sin(theta);

            return {
                x: cx + cos * x - sin * y,
                y: cy + sin * x + cos * y
            };
        };

        let arcData = svgArcToCenterParam(p0.x, p0.y, values[0], values[1], values[2], values[3], values[4], values[5], values[6]);
        let { rx, ry, cx, cy, endAngle, deltaAngle } = arcData;

        // arc rotation
        let deg = values[2];

        // final on path point
        let p = { x: values[5], y: values[6] };

        // collect extreme points – add end point
        let extremes = [p];

        // rotation to radians
        let alpha = deg * Math.PI / 180;
        let tan = Math.tan(alpha),
            p1, p2, p3, p4, theta;

        /**
        * find min/max from zeroes of directional derivative along x and y
        * along x axis
        */
        theta = Math.atan2(-ry * tan, rx);

        let angle1 = theta;
        let angle2 = theta + Math.PI;
        let angle3 = Math.atan2(ry, rx * tan);
        let angle4 = angle3 + Math.PI;

        // inner bounding box
        let xArr = [p0.x, p.x];
        let yArr = [p0.y, p.y];
        let xMin = Math.min(...xArr);
        let xMax = Math.max(...xArr);
        let yMin = Math.min(...yArr);
        let yMax = Math.max(...yArr);

        // on path point close after start
        let angleAfterStart = endAngle - deltaAngle * 0.001;
        let pP2 = arc(angleAfterStart, cx, cy, rx, ry, alpha);

        // on path point close before end
        let angleBeforeEnd = endAngle - deltaAngle * 0.999;
        let pP3 = arc(angleBeforeEnd, cx, cy, rx, ry, alpha);

        /**
         * expected extremes
         * if leaving inner bounding box
         * (between segment start and end point)
         * otherwise exclude elliptic extreme points
        */

        // right
        if (pP2.x > xMax || pP3.x > xMax) {
            // get point for this theta
            p1 = arc(angle1, cx, cy, rx, ry, alpha);
            extremes.push(p1);
        }

        // left
        if (pP2.x < xMin || pP3.x < xMin) {
            // get anti-symmetric point
            p2 = arc(angle2, cx, cy, rx, ry, alpha);
            extremes.push(p2);
        }

        // top
        if (pP2.y < yMin || pP3.y < yMin) {
            // get anti-symmetric point
            p4 = arc(angle4, cx, cy, rx, ry, alpha);
            extremes.push(p4);
        }

        // bottom
        if (pP2.y > yMax || pP3.y > yMax) {
            // get point for this theta
            p3 = arc(angle3, cx, cy, rx, ry, alpha);
            extremes.push(p3);
        }

        return extremes;
    }

    // cubic bezier.
    function cubicBezierExtremeT(p0, cp1, cp2, p) {
        let [x0, y0, x1, y1, x2, y2, x3, y3] = [p0.x, p0.y, cp1.x, cp1.y, cp2.x, cp2.y, p.x, p.y];

        /**
         * if control points are within 
         * bounding box of start and end point 
         * we cant't have extremes
         */
        let top = Math.min(p0.y, p.y);
        let left = Math.min(p0.x, p.x);
        let right = Math.max(p0.x, p.x);
        let bottom = Math.max(p0.y, p.y);

        if (
            cp1.y >= top && cp1.y <= bottom &&
            cp2.y >= top && cp2.y <= bottom &&
            cp1.x >= left && cp1.x <= right &&
            cp2.x >= left && cp2.x <= right
        ) {
            return []
        }

        var tArr = [],
            a, b, c, t, t1, t2, b2ac, sqrt_b2ac;
        for (var i = 0; i < 2; ++i) {
            if (i == 0) {
                b = 6 * x0 - 12 * x1 + 6 * x2;
                a = -3 * x0 + 9 * x1 - 9 * x2 + 3 * x3;
                c = 3 * x1 - 3 * x0;
            } else {
                b = 6 * y0 - 12 * y1 + 6 * y2;
                a = -3 * y0 + 9 * y1 - 9 * y2 + 3 * y3;
                c = 3 * y1 - 3 * y0;
            }
            if (Math.abs(a) < 1e-12) {
                if (Math.abs(b) < 1e-12) {
                    continue;
                }
                t = -c / b;
                if (0 < t && t < 1) {
                    tArr.push(t);
                }
                continue;
            }
            b2ac = b * b - 4 * c * a;
            if (b2ac < 0) {
                if (Math.abs(b2ac) < 1e-12) {
                    t = -b / (2 * a);
                    if (0 < t && t < 1) {
                        tArr.push(t);
                    }
                }
                continue;
            }
            sqrt_b2ac = Math.sqrt(b2ac);
            t1 = (-b + sqrt_b2ac) / (2 * a);
            if (0 < t1 && t1 < 1) {
                tArr.push(t1);
            }
            t2 = (-b - sqrt_b2ac) / (2 * a);
            if (0 < t2 && t2 < 1) {
                tArr.push(t2);
            }
        }

        var j = tArr.length;
        while (j--) {
            t = tArr[j];
        }
        return tArr;
    }

    function quadraticBezierExtremeT(p0, cp1, p) {
        /**
         * if control points are within 
         * bounding box of start and end point 
         * we cant't have extremes
         */
        let top = Math.min(p0.y, p.y);
        let left = Math.min(p0.x, p.x);
        let right = Math.max(p0.x, p.x);
        let bottom = Math.max(p0.y, p.y);
        let a, b, t;

        if (
            cp1.y >= top && cp1.y <= bottom &&
            cp1.x >= left && cp1.x <= right
        ) {
            return []
        }

        let [x0, y0, x1, y1, x2, y2] = [p0.x, p0.y, cp1.x, cp1.y, p.x, p.y];
        let extemeT = [];

        for (var i = 0; i < 2; ++i) {
            a = i == 0 ? x0 - 2 * x1 + x2 : y0 - 2 * y1 + y2;
            b = i == 0 ? -2 * x0 + 2 * x1 : -2 * y0 + 2 * y1;
            if (Math.abs(a) > 1e-12) {
                t = -b / (2 * a);
                if (t > 0 && t < 1) {
                    extemeT.push(t);
                }
            }
        }
        return extemeT
    }

    function commandIsFlat(points, tolerance = 0.025) {

        let p0 = points[0];
        let p = points[points.length-1];

        let xArr = points.map(pt => { return pt.x });
        let yArr = points.map(pt => { return pt.y });

        let xMin = Math.min(...xArr);
        let xMax = Math.max(...xArr);
        let yMin = Math.min(...yArr);
        let yMax = Math.max(...yArr);
        let w = xMax - xMin;
        let h = yMax - yMin;

        if (points.length < 3 || (w === 0 || h === 0)) {
            return { area: 0, flat: true, thresh: 0.0001, ratio: 0 };
        }

        let squareDist = getSquareDistance(p0, p);
        let squareDist1 = getSquareDistance(p0, points[0]);
        let squareDist2 = points.length>3 ? getSquareDistance(p, points[1]) : squareDist1;
        let squareDistAvg = (squareDist1+squareDist2)/2;

        tolerance = 0.5;
        let thresh = (w + h) * 0.5 * tolerance;

        let area = 0;
        for (let i = 0,l=points.length; i < l; i++) {
            let addX = points[i].x;
            let addY = points[i === points.length - 1 ? 0 : i + 1].y;
            let subX = points[i === points.length - 1 ? 0 : i + 1].x;
            let subY = points[i].y;
            area += addX * addY * 0.5 - subX * subY * 0.5;
        }

        area = +Math.abs(area).toFixed(9);
        let areaThresh = 1000;

        let ratio = area / (squareDistAvg);

        let isFlat = area=== 0 ? true : area < squareDistAvg/areaThresh;
        

        return { area: area, flat: isFlat, thresh: thresh, ratio: ratio, squareDist:squareDist, areaThresh:squareDist/areaThresh  };
    }

    function renderPath(svg, d = '', stroke = 'green', strokeWidth = '1%', render = true) {

        let path = `<path d="${d}" fill="none" stroke="${stroke}"  stroke-width="${strokeWidth}" /> `;

        if (render) {
            svg.insertAdjacentHTML("beforeend", path);
        } else {
            return path;
        }

    }

    /**
     * split segments into chunks to
     * prevent simplification across 
     * extremes, corners or direction changes
     */

    function getPathDataPlusChunks(pathDataPlus = [], debug = false) {

        // loop sub paths
        for (let s = 0, l = pathDataPlus.length; s < l; s++) {
            let sub = pathDataPlus[s];
            let pathDataSub = sub.pathData;
            pathDataPlus[s].chunks = [[pathDataSub[0]], []];

            let pathDataChunks = [[pathDataSub[0]], []];
            let ind = 1;

            let wasExtreme = false;
            let wasCorner = false;
            let wasClosePath = false;
            let prevType = 'M';
            let typeChange = false;

            for (let i = 1, len = pathDataSub.length; i < len; i++) {
                let com = pathDataSub[i];

                let { extreme, corner, directionChange } = com;
                typeChange = prevType !== com.type;
                let split = directionChange || wasExtreme || wasCorner || wasClosePath || typeChange;

                // new chunk
                if (split) {
                    /*
                    if(directionChange){
                        renderPoint(svg1, com.p0 , 'red')
                    }
                    if(wasExtreme){
                        renderPoint(svg1, com.p0 , 'blue')
                    }

                    if(wasCorner){
                        renderPoint(svg1, com.p0 , 'magenta')
                    }
                    
                    if(wasClosePath){
                        renderPoint(svg1, com.p0 , 'red')
                    }

                    if(typeChange && com.type==='Q' && prevType==='M'){
                        console.log('typechange', pathDataSub[i], pathDataSub[i-1]);
                        renderPoint(svg1, com.p0 , 'purple')
                    }
                        */

                    if (pathDataChunks[ind].length) {
                        pathDataChunks.push([]);
                        ind++;
                    }
                }

                wasExtreme = extreme;
                wasCorner = corner;
                wasClosePath = com.type.toLowerCase() === 'z';
                prevType = com.type;

                pathDataChunks[ind].push(com);

            }

            // debug rendering
            if (debug) {

                pathDataChunks.forEach((ch, i) => {
                    let stroke = i % 2 === 0 ? 'green' : 'orange';
                    if(i===pathDataChunks.length-2){
                        stroke = 'magenta';
                    }

                    let M = ch[0].p0;
                    if (M) {

                        let d = `M ${M.x} ${M.y}`;

                        ch.forEach(com => {

                            d += `${com.type} ${com.values.join(' ')}`;

                        });

                        renderPath(svg1, d, stroke, '0.5%', '0.5');
                    }

                });
            }

            // add to pathdataPlus object
            pathDataPlus[s].chunks = pathDataChunks;

        }

        return pathDataPlus

    }

    /**
     * split compound paths into 
     * sub path data array
     */
    function splitSubpaths(pathData) {

        let subPathArr = [];

        
        try{
            let subPathIndices = pathData.map((com, i) => (com.type.toLowerCase() === 'm' ? i : -1)).filter(i => i !== -1);

        }catch{
            console.log('catch', pathData);
        }

        let subPathIndices = pathData.map((com, i) => (com.type.toLowerCase() === 'm' ? i : -1)).filter(i => i !== -1);

        // no compound path
        if (subPathIndices.length === 1) {
            return [pathData]
        }
        subPathIndices.forEach((index, i) => {
            subPathArr.push(pathData.slice(index, subPathIndices[i + 1]));
        });

        return subPathArr;
    }

    /**
     * calculate split command points
     * for single t value 
     */
    function splitCommand(points, t) {

        let seg1 = [];
        let seg2 = [];

        let p0 = points[0];
        let cp1 = points[1];
        let cp2 = points[points.length - 2];
        let p = points[points.length - 1];
        let m0,m1,m2,m3,m4, p2;

        // cubic
        if (points.length === 4) {
            m0 = pointAtT([p0, cp1], t);
            m1 = pointAtT([cp1, cp2], t);
            m2 = pointAtT([cp2, p], t);
            m3 = pointAtT([m0, m1], t);
            m4 = pointAtT([m1, m2], t);

            // split end point
            p2 = pointAtT([m3, m4], t);

            // 1. segment
            seg1.push(
                { x: p0.x, y: p0.y },
                { x: m0.x, y: m0.y },
                { x: m3.x, y: m3.y },
                { x: p2.x, y: p2.y },
            );
            // 2. segment
            seg2.push(
                { x: p2.x, y: p2.y },
                { x: m4.x, y: m4.y },
                { x: m2.x, y: m2.y },
                { x: p.x, y: p.y },
            );
        }

        // quadratic
        else if (points.length === 3) {
            m1 = pointAtT([p0, cp1], t);
            m2 = pointAtT([cp1, p], t);
            p2 = pointAtT([m1, m2], t);

            // 1. segment
            seg1.push(
                { x: p0.x, y: p0.y },
                { x: m1.x, y: m1.y },
                { x: p2.x, y: p2.y },
            );

            // 1. segment
            seg2.push(
                { x: p2.x, y: p2.y },
                { x: m2.x, y: m2.y },
                { x: p.x, y: p.y },
            );
        }

        // lineto
        else if (points.length === 2) {
            m1 = pointAtT([p0, p], t);

            // 1. segment
            seg1.push(
                { x: p0.x, y: p0.y },
                { x: m1.x, y: m1.y },
            );

            // 1. segment
            seg2.push(
                { x: m1.x, y: m1.y },
                { x: p.x, y: p.y },
            );
        }
        return [seg1, seg2];
    }

    /**
     * calculate command extremes
     */

    function addExtemesToCommand(p0, values) {

        let pathDataNew = [];

        let type = values.length === 6 ? 'C' : 'Q';
        let cp1 = { x: values[0], y: values[1] };
        let cp2 = type === 'C' ? { x: values[2], y: values[3] } : cp1;
        let p = { x: values[4], y: values[5] };

        // get inner bbox
        let xMax = Math.max(p.x, p0.x);
        let xMin = Math.min(p.x, p0.x);
        let yMax = Math.max(p.y, p0.y);
        let yMin = Math.min(p.y, p0.y);

        let extremeCount = 0;

        if (
            cp1.x < xMin ||
            cp1.x > xMax ||
            cp1.y < yMin ||
            cp1.y > yMax ||
            cp2.x < xMin ||
            cp2.x > xMax ||
            cp2.y < yMin ||
            cp2.y > yMax

        ) {
            let pts = type === 'C' ? [p0, cp1, cp2, p] : [p0, cp1, p];
            let tArr = getBezierExtremeT(pts).sort();
            if(tArr.length){
                let commandsSplit = splitCommandAtTValues(p0, values, tArr);
                pathDataNew.push(...commandsSplit);
                extremeCount += commandsSplit.length;
            }else {
                console.log('no extreme: ', tArr);
                pathDataNew.push({ type: type, values: values });
            }

        }
        // no extremes
        else {
            pathDataNew.push({ type: type, values: values });
        }

        return { pathData: pathDataNew, count: extremeCount };

    }

    /**
     * split commands multiple times
     * based on command points
     * and t array
     */
    function splitCommandAtTValues(p0, values, tArr, returnCommand = true) {
        let segmentPoints = [];

        if (!tArr.length) {
            return false
        }

        let valuesL = values.length;
        let p = { x: values[valuesL - 2], y: values[valuesL - 1] };
        let cp1, cp2, points;

        if (values.length === 2) {
            points = [p0, p];
        }
        else if (values.length === 4) {
            cp1 = { x: values[0], y: values[1] };
            points = [p0, cp1, p];
        }
        else if (values.length === 6) {
            cp1 = { x: values[0], y: values[1] };
            cp2 = { x: values[2], y: values[3] };
            points = [p0, cp1, cp2, p];
        }

        if (tArr.length) {
            // single t
            if (tArr.length === 1) {
                let segs = splitCommand(points, tArr[0]);
                let points1 = segs[0];
                let points2 = segs[1];
                segmentPoints.push(points1, points2);

            } else {

                // 1st segment
                let t1 = tArr[0];
                let seg0 = splitCommand(points, t1);
                let points0 = seg0[0];
                segmentPoints.push(points0);
                points = seg0[1];

                for (let i = 1; i < tArr.length; i++) {
                    t1 = tArr[i - 1];
                    let t2 = tArr[i];

                    // new t value for 2nd segment
                    let t2_1 = (t2 - t1) / (1 - t1);
                    let segs2 = splitCommand(points, t2_1);
                    segmentPoints.push(segs2[0]);

                    if (i === tArr.length - 1) {
                        segmentPoints.push(segs2[segs2.length - 1]);
                    }
                    // take 2nd segment for next splitting
                    points = segs2[1];
                }
            }
        }

        if (returnCommand) {

            let pathData = [];
            let com, values;

            segmentPoints.forEach(seg => {
                com = { type: '', values: [] };
                seg.shift();
                values = seg.map(val => { return Object.values(val) }).flat();
                com.values = values;

                // cubic
                if (seg.length === 3) {
                    com.type = 'C';
                }

                // quadratic
                else if (seg.length === 2) {
                    com.type = 'Q';
                }

                // lineto
                else if (seg.length === 1) {
                    com.type = 'L';
                }
                pathData.push(com);
            });
            return pathData;
        }

        return segmentPoints;
    }

    /**
     * calculate polygon bbox
     */
    function getPolyBBox(vertices, decimals = -1) {
        let xArr = vertices.map(pt => pt.x);
        let yArr = vertices.map(pt => pt.y);
        let left = Math.min(...xArr);
        let right = Math.max(...xArr);
        let top = Math.min(...yArr);
        let bottom = Math.max(...yArr);
        let bb = {
            x: left,
            left: left,
            right: right,
            y: top,
            top: top,
            bottom: bottom,
            width: right - left,
            height: bottom - top
        };

        // round

        if (decimals > -1) {
            for (let prop in bb) {
                bb[prop] = +bb[prop].toFixed(decimals);
            }
        }

        return bb;
    }

    function getSubPathBBoxes(subPaths) {
        let bboxArr = [];
        subPaths.forEach((pathData) => {

            let bb = getPathDataBBox_sloppy(pathData);
            bboxArr.push(bb);
        });

        return bboxArr;
    }

    function checkBBoxIntersections(bb, bb1) {
        let [x, y, width, height, right, bottom] = [
            bb.x,
            bb.y,
            bb.width,
            bb.height,
            bb.x + bb.width,
            bb.y + bb.height
        ];
        let [x1, y1, width1, height1, right1, bottom1] = [
            bb1.x,
            bb1.y,
            bb1.width,
            bb1.height,
            bb1.x + bb1.width,
            bb1.y + bb1.height
        ];
        let intersects = false;
        if (width * height != width1 * height1) {
            if (width * height > width1 * height1) {
                if (x < x1 && right > right1 && y < y1 && bottom > bottom1) {
                    intersects = true;
                }
            }
        }
        return intersects;
    }

    /**
     * sloppy path bbox aaproximation
     */

    function getPathDataBBox_sloppy(pathData) {
        let pts = getPathDataPoly(pathData);
        let bb = getPolyBBox(pts);
        return bb;
    }

    /**
     * get path data poly
     * including command points
     * handy for faster/sloppy bbox approximations
     */

    function getPathDataPoly(pathData) {

        let poly = [];
        for (let i = 0; i < pathData.length; i++) {
            let com = pathData[i];
            let prev = i > 0 ? pathData[i - 1] : pathData[i];
            let { type, values } = com;
            let p0 = { x: prev.values[prev.values.length - 2], y: prev.values[prev.values.length - 1] };
            let p = values.length ? { x: values[values.length - 2], y: values[values.length - 1] } : '';
            let cp1 = values.length ? { x: values[0], y: values[1] } : '';

            switch (type) {

                // convert to cubic to get polygon
                case 'A':

                    if (typeof arcToBezier !== 'function') {

                        // get real radii
                        let rx = getDistance(p0, p) / 2;
                        let ptMid = interpolate(p0, p, 0.5);

                        let pt1 = getPointOnEllipse(ptMid.x, ptMid.y, rx, rx, 0);
                        let pt2 = getPointOnEllipse(ptMid.x, ptMid.y, rx, rx, Math.PI);
                        poly.push(pt1, pt2, p);

                        break;
                    }
                    let cubic = arcToBezier(p0, values);
                    cubic.forEach(com => {
                        let vals = com.values;
                        let cp1 = { x: vals[0], y: vals[1] };
                        let cp2 = { x: vals[2], y: vals[3] };
                        let p = { x: vals[4], y: vals[5] };
                        poly.push(cp1, cp2, p);
                    });
                    break;

                case 'C':
                    let cp2 = { x: values[2], y: values[3] };
                    poly.push(cp1, cp2);
                    break;
                case 'Q':
                    poly.push(cp1);
                    break;
            }

            // M and L commands
            if (type.toLowerCase() !== 'z') {
                poly.push(p);
            }
        }

        return poly;
    }

    /**
     * get exact path BBox
     * calculating extremes for all command types
     */

    function getPathDataBBox(pathData) {

        // save extreme values
        let xMin = Infinity;
        let xMax = -Infinity;
        let yMin = Infinity;
        let yMax = -Infinity;

        const setXYmaxMin = (pt) => {
            if (pt.x < xMin) {
                xMin = pt.x;
            }
            if (pt.x > xMax) {
                xMax = pt.x;
            }
            if (pt.y < yMin) {
                yMin = pt.y;
            }
            if (pt.y > yMax) {
                yMax = pt.y;
            }
        };

        for (let i = 0; i < pathData.length; i++) {
            let com = pathData[i];
            let { type, values } = com;
            let valuesL = values.length;
            let comPrev = pathData[i - 1] ? pathData[i - 1] : pathData[i];
            let valuesPrev = comPrev.values;
            let valuesPrevL = valuesPrev.length;

            if (valuesL) {
                let p0 = { x: valuesPrev[valuesPrevL - 2], y: valuesPrev[valuesPrevL - 1] };
                let p = { x: values[valuesL - 2], y: values[valuesL - 1] };
                // add final on path point
                setXYmaxMin(p);

                if (type === 'C' || type === 'Q') {
                    let cp1 = { x: values[0], y: values[1] };
                    let cp2 = type === 'C' ? { x: values[2], y: values[3] } : cp1;
                    let pts = type === 'C' ? [p0, cp1, cp2, p] : [p0, cp1, p];

                    let bezierExtremesT = getBezierExtremeT(pts);
                    bezierExtremesT.forEach(t => {
                        let pt = pointAtT(pts, t);
                        setXYmaxMin(pt);
                    });
                }

                else if (type === 'A') {
                    let arcExtremes = getArcExtemes(p0, values);
                    arcExtremes.forEach(pt => {
                        setXYmaxMin(pt);
                    });
                }
            }
        }

        let bbox = { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin };
        return bbox
    }

    /**
     * shift starting point
     */
    function shiftSvgStartingPoint(pathData, offset) {
        let pathDataL = pathData.length;
        let newStartIndex = 0;
        let lastCommand = pathData[pathDataL - 1]["type"];
        let isClosed = lastCommand.toLowerCase() === "z";

        if (!isClosed || offset < 1 || pathData.length < 3) {
            return pathData;
        }

        let trimRight = isClosed ? 1 : 0;

        // add explicit lineto
        addClosePathLineto(pathData);

        // M start offset
        newStartIndex =
            offset + 1 < pathData.length - 1
                ? offset + 1
                : pathData.length - 1 - trimRight;

        // slice array to reorder
        let pathDataStart = pathData.slice(newStartIndex);
        let pathDataEnd = pathData.slice(0, newStartIndex);

        // remove original M
        pathDataEnd.shift();
        let pathDataEndL = pathDataEnd.length;

        let pathDataEndLastValues, pathDataEndLastXY;
        pathDataEndLastValues = pathDataEnd[pathDataEndL - 1].values || [];
        pathDataEndLastXY = [
            pathDataEndLastValues[pathDataEndLastValues.length - 2],
            pathDataEndLastValues[pathDataEndLastValues.length - 1]
        ];

        if (trimRight) {
            pathDataStart.pop();
            pathDataEnd.push({
                type: "Z",
                values: []
            });
        }
        // prepend new M command and concatenate array chunks
        pathData = [
            {
                type: "M",
                values: pathDataEndLastXY
            },
            ...pathDataStart,
            ...pathDataEnd,
        ];

        return pathData;
    }

    /**
     * Add closing lineto:
     * needed for path reversing or adding points
     */

    function addClosePathLineto(pathData) {
        let pathDataL = pathData.length;
        let closed = pathData[pathDataL - 1]["type"] == "Z" ? true : false;

        let M = pathData[0];
        let [x0, y0] = [M.values[0], M.values[1]].map(val => { return +val.toFixed(8) });
        let lastCom = closed ? pathData[pathDataL - 2] : pathData[pathDataL - 1];
        let lastComL = lastCom.values.length;
        let [xE, yE] = [lastCom.values[lastComL - 2], lastCom.values[lastComL - 1]].map(val => { return +val.toFixed(8) });

        if (closed && (x0 != xE || y0 != yE)) {

            pathData.pop();
            pathData.push(
                {
                    type: "L",
                    values: [x0, y0]
                },
                {
                    type: "Z",
                    values: []
                }
            );
        }

        return pathData;
    }

    /**
     * remove zero length commands
     * replace flat beziers with lintos
     * replace closing lines with z
     * rearrange commands to avoid unnessessary linetos
     */

    function cleanUpPathData(pathData, addExtremes = false, removeClosingLines = true, startToTop = true, debug = false) {

        let simplyfy_debug_log = [];

        pathData = JSON.parse(JSON.stringify(pathData));
        let pathDataNew = [pathData[0]];

        /**
         * get poly bbox to define
         * an appropriate relative threshold
         * for flat or short segment detection
         */
        let pathPoly = getPathDataVertices(pathData);
        let bb = getPolyBBox(pathPoly);
        let { width, height } = bb;
        let tolerance = (width + height) / 2 * 0.001;

        // previous on path point
        let p0 = { x: pathData[0].values[0], y: pathData[0].values[1] };
        let M = { x: pathData[0].values[0], y: pathData[0].values[1] };

        let addedExtremes = false;

        for (let c = 1, len = pathData.length; len && c < len; c++) {
            let com = pathData[c];

            let comN = pathData[c + 1] ? pathData[c + 1] : '';
            let { type, values } = com;

            let valsL = values.slice(-2);
            let p = { x: valsL[0], y: valsL[1] };

            // segment command points - including previous final on-path
            let pts = [p0, p];
            if (type === 'C' || type === 'Q') pts.push({ x: values[0], y: values[1] });
            if (type === 'C') pts.push({ x: values[2], y: values[3] });

            // get relative threshold based on averaged command dimensions
            let xArr = pts.map(pt => { return pt.x });
            let yArr = pts.map(pt => { return pt.y });
            let xMax = Math.max(...xArr);
            let xMin = Math.min(...xArr);
            let yMax = Math.max(...yArr);
            let yMin = Math.min(...yArr);

            let w = xMax - xMin;
            let h = yMax - yMin;
            let dimA = (w + h) / 2 || 0;

            if (type.toLowerCase() !== 'z') {

                // zero length

                if ((p.x === p0.x && p.y === p0.y) || (type === 'L' && dimA < tolerance)) {

                    if (debug) simplyfy_debug_log.push(`removed zero length ${type}`);
                    continue
                }

                /**
                 * simplify adjacent linetos
                 * based on their flatness
                 */
                else if (type === 'L') {

                    if (removeClosingLines && p.x === M.x && p.y === M.y && comN.type.toLowerCase() === 'z') {
                        if (debug) simplyfy_debug_log.push(`unnessecary closing linto`);
                        continue
                    }

                    if (comN.type === 'L') {

                        let valuesNL = comN.values.slice(-2);
                        let pN = { x: valuesNL[0], y: valuesNL[1] };

                        // check if adjacent linetos are flat

                        let flatness = commandIsFlat([p0, p, pN], tolerance);
                        let isFlatN = flatness.flat;

                        // next lineto is flat – don't add command
                        if (isFlatN) {

                            if (debug) simplyfy_debug_log.push(`remove flat linetos`);
                            continue
                        }
                    }
                }

                if (type === 'C') {
                    /**
                     * detect flat beziers
                     * often used for morphing 
                     * animation
                     */

                    let cp1 = { x: values[0], y: values[1] };
                    let cp2 = { x: values[2], y: values[3] };
                    let pts = [p0, cp1, cp2, p];

                    let flatness = commandIsFlat(pts, tolerance);
                    let isFlat = flatness.flat;
                    let ratio = flatness.ratio;

                    let valuesNL = comN ? comN.values.slice(-2) : '';
                    let pN = valuesNL.length ? { x: valuesNL[0], y: valuesNL[1] } : '';

                    if (isFlat) {
                        
                        let flatnessN, isFlatN=false;

                        if (comN.type === 'C') {

                            // check if adjacent curves are also flat
                            flatnessN = commandIsFlat([p0, p, pN], tolerance);
                            isFlatN = flatnessN.flat;

                            if (isFlatN) {

                                if (debug) simplyfy_debug_log.push(`skip cubic - actually a lineto:  area-ratio: ${ratio}, flatness next:${flatnessN}`);

                            }
                        }

                        if (ratio < 0.1 ) {

                            simplyfy_debug_log.push(`simplify cubic to lineto`);

                        }
                        

                    }
                    // not flat
                    else {
                        // add extremes
                        if (addExtremes) {
                            addedExtremes = addExtemesToCommand(p0, values);
                            com = addedExtremes.pathData;
                        }

                        if (addExtremes && addedExtremes.count) simplyfy_debug_log.push(`added extremes: ${addedExtremes.count}`);
                    }
                }

            }

            // add new commands
            if (com.length) {
                pathDataNew.push(...com);
            } else {
                pathDataNew.push(com);
            }

            if (type.toLowerCase() === "z") {
                p0 = M;
            } else if (type === "M") {
                M = { x: valsL[0], y: valsL[1] };
            }

            // new previous point
            p0 = { x: valsL[0], y: valsL[1] };

        }//end for

        pathDataNew = optimizeStartingPoints(pathDataNew, removeClosingLines, startToTop);

        simplyfy_debug_log.push(`original command count: ${pathData.length}; removed:${pathData.length - pathDataNew.length} `);

        if (debug) console.log(simplyfy_debug_log);

        return pathDataNew;
    }

    /**
     * avoids starting points in the middle of 2 smooth curves
     * can replace linetos with closepaths
     */

    function optimizeStartingPoints(pathData, removeFinalLineto = false, startToTop = false) {

        let pathDataArr = splitSubpaths(pathData);

        let pathDataNew = [];
        let len = pathDataArr.length;

        for (let i = 0; i < len; i++) {
            let pathData = pathDataArr[i];

            // move starting point to first lineto
            let firstLIndex = pathData.findIndex(cmd => cmd.type === 'L');
            let firstBezierIndex = pathData.findIndex(cmd => cmd.type === 'C' || cmd.type === 'Q');
            let commands = new Set([...pathData.map(com => com.type)]);
            let hasLinetos = commands.has('L');
            let hasBeziers = commands.has('C') || commands.has('Q');

            let len = pathData.length;
            let isClosed = pathData[len - 1].type.toLowerCase() === 'z';

            if (!isClosed) {
                pathDataNew.push(...pathData);
                continue
            }

            if (isClosed) {

                let extremeIndex = -1;
                let newIndex = 0;

                if (startToTop) {

                    let indices = [];
                    for (let i = 0, len = pathData.length; i < len; i++) {
                        let com = pathData[i];
                        let { type, values } = com;
                        if (values.length) {

                            let valsL = values.slice(-2);
                            let p = { x: valsL[0], y: valsL[1], index: i };
                            indices.push(p);

                        }
                    }

                    // find top most
                    indices = indices.sort((a, b) => {
                        a.y - b.y;

                        /*
                        let n = b.y - a.y;
                        if (n !== 0) {
                            return n;
                        }
                        return b.x - a.x;
                        */
                    });
                    newIndex = indices[0].index;

                } else {

                    let pathPoly = getPathDataVertices(pathData);
                    let bb = getPolyBBox(pathPoly);
                    let { left, right, top, bottom, width, height } = bb;
                    let minX = Infinity;
                    let minY = Infinity;

                    // get extreme 
                    if (hasBeziers) {

                        for (let i = 0, len = pathData.length; i < len; i++) {
                            let com = pathData[i];
                            let { type, values } = com;
                            if (type === 'C' || type === 'Q') {

                                let valsL = values.slice(-2);
                                let p = { x: valsL[0], y: valsL[1] };
                                // is extreme relative to bounding box 
                                if (p.x === left || p.y === top || p.x === right || p.y === bottom) {
                                    if (p.x < minX && p.y < minY) {
                                        extremeIndex = i;
                                        minX = p.x;
                                        minY = p.y;
                                    }
                                }
                            }
                        }
                    }

                    // set to first bezier extreme or first L
                    firstBezierIndex = extremeIndex > -1 ? extremeIndex : firstBezierIndex;
                    newIndex = hasLinetos ? firstLIndex : firstBezierIndex;

                }

                // reorder 
                pathData = shiftSvgStartingPoint(pathData, newIndex);
                len = pathData.length;

                // remove last lineto
                let M = { x: pathData[0].values[0], y: pathData[0].values[1] };
                let penultimateCom = pathData[len - 2];
                let penultimateType = penultimateCom.type;
                let penultimateComCoords = penultimateCom.values.slice(-2);

                let isClosingCommand = penultimateType === 'L' && penultimateComCoords[0] === M.x && penultimateComCoords[1] === M.y;

                if (removeFinalLineto && isClosingCommand) {

                    pathData.splice(len - 2, 1);
                }
                pathDataNew.push(...pathData);

            }
        }
        return pathDataNew
    }

    /**
     * get pathdata area
     */

    function getPathArea(pathData, decimals = 9) {
        let totalArea = 0;
        let polyPoints = [];

        let subPathsData = splitSubpaths(pathData);
        let isCompoundPath = subPathsData.length > 1 ? true : false;
        let counterShapes = [];

        // check intersections for compund paths
        if (isCompoundPath) {
            let bboxArr = getSubPathBBoxes(subPathsData);

            bboxArr.forEach(function (bb, b) {

                for (let i = 0; i < bboxArr.length; i++) {
                    let bb2 = bboxArr[i];
                    if (bb != bb2) {
                        let intersects = checkBBoxIntersections(bb, bb2);
                        if (intersects) {
                            counterShapes.push(i);
                        }
                    }
                }
            });
        }

        subPathsData.forEach((pathData, d) => {

            polyPoints = [];
            let comArea = 0;
            let pathArea = 0;
            let multiplier = 1;
            let pts = [];

            pathData.forEach(function (com, i) {
                let [type, values] = [com.type, com.values];
                let valuesL = values.length;

                if (values.length) {
                    let prevC = i > 0 ? pathData[i - 1] : pathData[0];
                    let prevCVals = prevC.values;
                    let prevCValsL = prevCVals.length;
                    let p0 = { x: prevCVals[prevCValsL - 2], y: prevCVals[prevCValsL - 1] };
                    let p = { x: values[valuesL - 2], y: values[valuesL - 1] };

                    // C commands
                    if (type === 'C' || type === 'Q') {
                        let cp1 = { x: values[0], y: values[1] };
                        pts = type === 'C' ? [p0, cp1, { x: values[2], y: values[3] }, p] : [p0, cp1, p];
                        let areaBez = Math.abs(getBezierArea(pts));
                        comArea += areaBez;

                        polyPoints.push(p0, p);
                    }

                    // A commands
                    else if (type === 'A') {
                        let arcData = svgArcToCenterParam(p0.x, p0.y, com.values[0], com.values[1], com.values[2], com.values[3], com.values[4], p.x, p.y);
                        let { cx, cy, rx, ry, startAngle, endAngle, deltaAngle } = arcData;

                        let arcArea = Math.abs(getEllipseArea(rx, ry, startAngle, endAngle));

                        // subtract remaining polygon between p0, center and p
                        let polyArea = Math.abs(getPolygonArea([p0, { x: cx, y: cy }, p]));
                        arcArea -= polyArea;

                        polyPoints.push(p0, p);
                        comArea += arcArea;
                    }

                    // L commands
                    else {
                        polyPoints.push(p0, p);
                    }
                }
            });

            let areaPoly = getPolygonArea(polyPoints);

            if (counterShapes.indexOf(d) !== -1) {
                multiplier = -1;
            }

            if (
                (areaPoly < 0 && comArea < 0)
            ) {
                // are negative
                pathArea = (Math.abs(comArea) - Math.abs(areaPoly)) * multiplier;

            } else {
                pathArea = (Math.abs(comArea) + Math.abs(areaPoly)) * multiplier;
            }

            totalArea += pathArea;
        });

        return totalArea;
    }

    /**
     * compare bezier area diffs
     */
    function getBezierAreaAccuracy(cpts = [], areaPath = 0, areaPoly = 0, tolerance = 0.75) {

        let type = cpts.length === 4 ? 'C' : 'Q';
        let p0 = cpts.shift();
        let cp1 = cpts[0];
        let p = cpts[cpts.length - 1];
        let cp2 = type === 'C' ? cpts[1] : cp1;

        let res = { accurate: false, areaDiff: Infinity, comArea: null, cpArea: null, signChange: null };

        /**
         * check self intersections
         * won't work for simplifications
         */
        let selfIntersecting = checkLineIntersection(p0, p, cp1, cp2, true);
        let selfIntersecting2 = checkLineIntersection(p0, cp1, p, cp2, true);
        if (selfIntersecting || selfIntersecting2) {

            return res
        }

        /**
         * check sign changes 
         * from cpts poly
         * they indicate a wrong approximation
         */

        res.cpArea = getPolygonArea([p0, ...cpts]);
        res.signChange = (res.cpArea < 0 && areaPoly > 0) || (res.cpArea > 0 && areaPoly < 0);

        if (res.signChange) {

            return res
        }

        /**
         * check bézier area
         */
        let com = [
            { type: 'M', values: [p0.x, p0.y] },
            { type: type, values: [...cpts.map(pt => [pt.x, pt.y]).flat()] }
        ];
        res.comArea = getPathArea(com);
        res.areaDiff = getRelativeAreaDiff(areaPath, res.comArea);

        // very accurate - used to skip alternative calculations
        res.accurate = res.areaDiff < tolerance * 0.3;

        return res
    }

    /**
     * get ellipse area
     * skips to circle calculation if rx===ry
     */

    function getEllipseArea(rx, ry, startAngle, endAngle) {
        const totalArea = Math.PI * rx * ry;
        let angleDiff = (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);
        // If circle, use simple circular formula
        if (rx === ry) return totalArea * (angleDiff / (2 * Math.PI));

        // Convert absolute angles to parametric angles
        const absoluteToParametric = (phi)=>{
          return Math.atan2(rx * Math.sin(phi), ry * Math.cos(phi));
        };
        startAngle = absoluteToParametric(startAngle);
        endAngle = absoluteToParametric(endAngle);
        angleDiff = (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);
        return totalArea * (angleDiff / (2 * Math.PI));
    }

    /**
     * compare areas 
     * for thresholds
     * returns a percentage value
     */

    function getRelativeAreaDiff(area0, area1) {
        let diff = Math.abs(area0 - area1);
        return Math.abs(100 - (100 / area0 * (area0 + diff)))
    }

    /**
     * get bezier area
     */
    function getBezierArea(pts) {

        let [p0, cp1, cp2, p] = [pts[0], pts[1], pts[2], pts[pts.length - 1]];
        let area;

        if (pts.length < 3) return 0;

        // quadratic beziers
        if (pts.length === 3) {
            cp1 = {
                x: pts[0].x * 1 / 3 + pts[1].x * 2 / 3,
                y: pts[0].y * 1 / 3 + pts[1].y * 2 / 3
            };

            cp2 = {
                x: pts[2].x * 1 / 3 + pts[1].x * 2 / 3,
                y: pts[2].y * 1 / 3 + pts[1].y * 2 / 3
            };
        }

        area = ((p0.x * (-2 * cp1.y - cp2.y + 3 * p.y) +
            cp1.x * (2 * p0.y - cp2.y - p.y) +
            cp2.x * (p0.y + cp1.y - 2 * p.y) +
            p.x * (-3 * p0.y + cp1.y + 2 * cp2.y)) *
            3) / 20;
        return area;
    }

    function getPolygonArea(points, tolerance = 0.001) {
        let area = 0;
        for (let i = 0, len = points.length; len && i < len; i++) {
            let addX = points[i].x;
            let addY = points[i === points.length - 1 ? 0 : i + 1].y;
            let subX = points[i === points.length - 1 ? 0 : i + 1].x;
            let subY = points[i].y;
            area += addX * addY * 0.5 - subX * subY * 0.5;
        }
        return area;
    }

    /**
     * find cubic segments that
     * could be expressed by arcs
     */

    function replaceCubicsByArcs(pathData, tolerance = 7.5) {

        let pathDataNew = [];
        let subPaths = splitSubpaths(pathData);

        for (let s = 0, l = subPaths.length; s < l; s++) {

            let pathData = subPaths[s];

            let pathDataSub = [];
            let M = { x: pathData[0].values[0], y: pathData[0].values[1] };
            let p0 = M;
            let cp1, cp2, p;

            for (let i = 0, len = pathData.length; i < len; i++) {
                let com = pathData[i];

                let { type, values } = com;

                let valsL = values.slice(-2);
                p = { x: valsL[0], y: valsL[1] };

                if (type === 'M') {
                    M = { x: values[0], y: values[1] };
                    p0 = M;
                }

                if (type.toLowerCase() === 'z') {
                    p0 = M;
                }

                if (type === 'C') {

                    cp1 = { x: values[0], y: values[1] };
                    cp2 = { x: values[2], y: values[3] };

                    // get original cubic area 
                    [
                        { type: 'M', values: [p0.x, p0.y] },
                        { type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, p.x, p.y] }
                    ];

                    let comArc = cubicToArc(p0, cp1, cp2, p, tolerance);
                    let { isArc, area } = comArc;

                    // can be arc
                    if (isArc) {
                        com = comArc.com;
                    }
                    pathDataSub.push(com);

                    // new start
                    p0 = p;
                }

                else {
                    // new start
                    p0 = p;
                    pathDataSub.push(com);
                }
            }

            pathDataNew.push(...pathDataSub);

        }

        // combine

        return pathDataNew;
    }

    /**
     * cubics to arcs
     */

    function cubicToArc(p0, cp1, cp2, p, tolerance = 7.5) {

        let com = { type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, p.x, p.y] };

        let arcSegArea = 0, isArc = false;

        // check angles
        let angle1 = getAngle(p0, cp1, true);
        let angle2 = getAngle(p, cp2, true);
        let deltaAngle = Math.abs(angle1 - angle2) * 180 / Math.PI;

        let angleDiff = Math.abs((deltaAngle % 180) - 90);
        let isRightAngle = angleDiff < 3;

        if (isRightAngle) {
            // point between cps

            let pI = checkLineIntersection(p0, cp1, p, cp2, false);

            if (pI) {

                let r1 = getDistance(p0, pI);
                let r2 = getDistance(p, pI);

                let rMax = +Math.max(r1, r2).toFixed(8);
                let rMin = +Math.min(r1, r2).toFixed(8);

                let rx = rMin;
                let ry = rMax;

                let arcArea = getPolygonArea([p0, cp1, cp2, p]);
                let sweep = arcArea < 0 ? 0 : 1;

                let w = Math.abs(p.x - p0.x);
                let h = Math.abs(p.y - p0.y);
                let landscape = w > h;

                let circular = (100 / rx * Math.abs(rx - ry)) < 5;

                if (circular) {

                    rx = rMax;
                    ry = rx;
                }

                if (landscape) {

                    rx = rMax;
                    ry = rMin;
                }

                // get original cubic area 
                let comO = [
                    { type: 'M', values: [p0.x, p0.y] },
                    { type: 'C', values: [cp1.x, cp1.y, cp2.x, cp2.y, p.x, p.y] }
                ];

                let comArea = getPathArea(comO);

                // new arc command
                let comArc = { type: 'A', values: [rx, ry, 0, 0, sweep, p.x, p.y] };

                // calculate arc seg area
                arcSegArea = ( Math.PI * (rx * ry) ) / 4;

                // subtract polygon between start, end and center point
                arcSegArea -=Math.abs(getPolygonArea([p0, p, pI]));

                let areaDiff = getRelativeAreaDiff(comArea, arcSegArea);

                if (areaDiff < tolerance) {
                    isArc = true;
                    com = comArc;
                }

            }
        }

        return { com: com, isArc: isArc, area: arcSegArea }

    }

    /**
     * combine adjacent arcs
     */

    function combineArcs(pathData) {

        let arcSeq = [[]];
        let ind = 0;
        let arcIndices = [[]];
        let p0 = { x: pathData[0].values[0], y: pathData[0].values[1] }, p;

        for (let i = 0, len = pathData.length; i < len; i++) {
            let com = pathData[i];
            let { type, values } = com;

            if (type === 'A') {

                let comPrev = pathData[i - 1];

                /** 
                 * previous p0 values might not be correct 
                 * anymore due to cubic simplification
                 */
                let valsL = comPrev.values.slice(-2);
                p0 = { x: valsL[0], y: valsL[1] };

                let [rx, ry, xAxisRotation, largeArc, sweep, x, y] = values;

                // check if arc is circular
                let circular = (100 / rx * Math.abs(rx - ry)) < 5;

                p = { x: values[5], y: values[6] };
                com.p0 = p0;
                com.p = p;
                com.circular = circular;

                let comNext = pathData[i + 1];

                if (!arcSeq[ind].length && comNext && comNext.type === 'A') {
                    arcSeq[ind].push(com);
                    arcIndices[ind].push(i);
                }

                if (comNext && comNext.type === 'A') {
                    let [rx1, ry1, xAxisRotation0, largeArc, sweep, x, y] = comNext.values;
                    let diffRx = rx != rx1 ? 100 / rx * Math.abs(rx - rx1) : 0;
                    let diffRy = ry != ry1 ? 100 / ry * Math.abs(ry - ry1) : 0;

                    p = { x: comNext.values[5], y: comNext.values[6] };
                    comNext.p0 = p0;
                    comNext.p = p;

                    // add if radii are almost same
                    if (diffRx < 5 && diffRy < 5) {

                        arcSeq[ind].push(comNext);
                        arcIndices[ind].push(i + 1);
                    } else {

                        // start new segment
                        arcSeq.push([]);
                        arcIndices.push([]);
                        ind++;

                    }
                }

                else {

                    arcSeq.push([]);
                    arcIndices.push([]);
                    ind++;
                }
            }
        }

        if (!arcIndices.length) return pathData;

        arcSeq = arcSeq.filter(item => item.length);
        arcIndices = arcIndices.filter(item => item.length);

        // Process in reverse to avoid index shifting
        for (let i = arcSeq.length - 1; i >= 0; i--) {
            const seq = arcSeq[i];
            const start = arcIndices[i][0];
            const len = seq.length;

            // Average radii to prevent distortions
            let rxA = 0, ryA = 0;
            seq.forEach(({ values }) => {
                const [rx, ry] = values;
                rxA += rx;
                ryA += ry;
            });
            rxA /= len;
            ryA /= len;

            // Correct near-circular arcs

            // check if arc is circular
            let circular = (100 / rxA * Math.abs(rxA - ryA)) < 5;

            if (circular) {
                // average radii
                rxA = (rxA + ryA) / 2;
                ryA = rxA;
            }

            let comPrev = pathData[start - 1];
            let comPrevVals = comPrev.values.slice(-2);
            ({ type: 'M', values: [comPrevVals[0], comPrevVals[1]] });

            if (len === 4) {

                let [rx, ry, xAxisRotation, largeArc, sweep, x1, y1] = seq[1].values;
                let [, , , , , x2, y2] = seq[3].values;

                if (circular) {

                    // simplify radii
                    rxA = 1;
                    ryA = 1;
                }

                let com1 = { type: 'A', values: [rxA, ryA, xAxisRotation, largeArc, sweep, x1, y1] };
                let com2 = { type: 'A', values: [rxA, ryA, xAxisRotation, largeArc, sweep, x2, y2] };

                // This now correctly replaces the original 4 arc commands with 2
                pathData.splice(start, len, com1, com2);

            }

            else if (len === 3) {

                let [rx, ry, xAxisRotation, largeArc, sweep, x1, y1] = seq[0].values;
                let [rx2, ry2, , , , x2, y2] = seq[2].values;

                // must be large arc
                largeArc = 1;
                let com1 = { type: 'A', values: [rxA, ryA, xAxisRotation, largeArc, sweep, x2, y2] };

                // replace
                pathData.splice(start, len, com1);

            }

            else if (len === 2) {

                let [rx, ry, xAxisRotation, largeArc, sweep, x1, y1] = seq[0].values;
                let [rx2, ry2, , , , x2, y2] = seq[1].values;

                // if circular or non-elliptic xAxisRotation has no effect
                if (circular) {
                    rxA = 1;
                    ryA = 1;
                    xAxisRotation = 0;
                }

                // check if arc is already ideal
                let { p0, p } = seq[0];
                let [p0_1, p_1] = [seq[1].p0, seq[1].p];

                if (p0.x !== p_1.x || p0.y !== p_1.y) {

                    let com1 = { type: 'A', values: [rxA, ryA, xAxisRotation, largeArc, sweep, x2, y2] };

                    // replace
                    pathData.splice(start, len, com1);
                }

            }

            else ;
        }

        return pathData
    }

    /**
     * convert cubic circle approximations
     * to more compact arcs
     */

    function pathDataArcsToCubics(pathData, {
        arcAccuracy = 1
    } = {}) {

        let pathDataCubic = [pathData[0]];
        for (let i = 1, len = pathData.length; i < len; i++) {

            let com = pathData[i];
            let comPrev = pathData[i - 1];
            let valuesPrev = comPrev.values;
            let valuesPrevL = valuesPrev.length;
            let p0 = { x: valuesPrev[valuesPrevL - 2], y: valuesPrev[valuesPrevL - 1] };

            if (com.type === 'A') {
                // add all C commands instead of Arc
                let cubicArcs = arcToBezier$1(p0, com.values, arcAccuracy);
                cubicArcs.forEach((cubicArc) => {
                    pathDataCubic.push(cubicArc);
                });
            }

            else {
                // add command
                pathDataCubic.push(com);
            }
        }

        return pathDataCubic

    }

    function pathDataQuadraticToCubic(pathData) {

        let pathDataQuadratic = [pathData[0]];
        for (let i = 1, len = pathData.length; i < len; i++) {

            let com = pathData[i];
            let comPrev = pathData[i - 1];
            let valuesPrev = comPrev.values;
            let valuesPrevL = valuesPrev.length;
            let p0 = { x: valuesPrev[valuesPrevL - 2], y: valuesPrev[valuesPrevL - 1] };

            if (com.type === 'Q') {
                pathDataQuadratic.push(quadratic2Cubic(p0, com.values));
            }

            else {
                // add command
                pathDataQuadratic.push(com);
            }
        }

        return pathDataQuadratic
    }

    /**
     * convert quadratic commands to cubic
     */
    function quadratic2Cubic(p0, com) {
        if (Array.isArray(p0)) {
            p0 = {
                x: p0[0],
                y: p0[1]
            };
        }
        let cp1 = {
            x: p0.x + 2 / 3 * (com[0] - p0.x),
            y: p0.y + 2 / 3 * (com[1] - p0.y)
        };
        let cp2 = {
            x: com[2] + 2 / 3 * (com[0] - com[2]),
            y: com[3] + 2 / 3 * (com[1] - com[3])
        };
        return ({ type: "C", values: [cp1.x, cp1.y, cp2.x, cp2.y, com[2], com[3]] });
    }

    /**
     * convert pathData to 
     * This is just a port of Dmitry Baranovskiy's 
     * pathToRelative/Absolute methods used in snap.svg
     * https://github.com/adobe-webplatform/Snap.svg/
     */

    function pathDataToAbsoluteOrRelative(pathData, toRelative = false, decimals = -1) {
        if (decimals >= 0) {
            pathData[0].values = pathData[0].values.map(val => +val.toFixed(decimals));
        }

        let M = pathData[0].values;
        let x = M[0],
            y = M[1],
            mx = x,
            my = y;

        for (let i = 1, len = pathData.length; i < len; i++) {
            let com = pathData[i];
            let { type, values } = com;
            let newType = toRelative ? type.toLowerCase() : type.toUpperCase();

            if (type !== newType) {
                type = newType;
                com.type = type;

                switch (type) {
                    case "a":
                    case "A":
                        values[5] = toRelative ? values[5] - x : values[5] + x;
                        values[6] = toRelative ? values[6] - y : values[6] + y;
                        break;
                    case "v":
                    case "V":
                        values[0] = toRelative ? values[0] - y : values[0] + y;
                        break;
                    case "h":
                    case "H":
                        values[0] = toRelative ? values[0] - x : values[0] + x;
                        break;
                    case "m":
                    case "M":
                        if (toRelative) {
                            values[0] -= x;
                            values[1] -= y;
                        } else {
                            values[0] += x;
                            values[1] += y;
                        }
                        mx = toRelative ? values[0] + x : values[0];
                        my = toRelative ? values[1] + y : values[1];
                        break;
                    default:
                        if (values.length) {
                            for (let v = 0; v < values.length; v++) {
                                values[v] = toRelative
                                    ? values[v] - (v % 2 ? y : x)
                                    : values[v] + (v % 2 ? y : x);
                            }
                        }
                }
            }

            let vLen = values.length;
            switch (type) {
                case "z":
                case "Z":
                    x = mx;
                    y = my;
                    break;
                case "h":
                case "H":
                    x = toRelative ? x + values[0] : values[0];
                    break;
                case "v":
                case "V":
                    y = toRelative ? y + values[0] : values[0];
                    break;
                case "m":
                case "M":
                    mx = values[vLen - 2] + (toRelative ? x : 0);
                    my = values[vLen - 1] + (toRelative ? y : 0);
                default:
                    x = values[vLen - 2] + (toRelative ? x : 0);
                    y = values[vLen - 1] + (toRelative ? y : 0);
            }

            if (decimals >= 0) {
                com.values = com.values.map(val => +val.toFixed(decimals));
            }
        }
        return pathData;
    }

    function pathDataToRelative(pathData, decimals = -1) {
        return pathDataToAbsoluteOrRelative(pathData, true, decimals)
    }

    function pathDataToAbsolute(pathData, decimals = -1) {
        return pathDataToAbsoluteOrRelative(pathData, false, decimals)
    }

    /**
     * decompose/convert shorthands to "longhand" commands:
     * H, V, S, T => L, L, C, Q
     * reversed method: pathDataToShorthands()
     */

    function pathDataToLonghands(pathData, decimals = -1, test = true) {

        // analyze pathdata – if you're sure your data is already absolute skip it via test=false
        let hasRel;

        if (test) {
            let commandTokens = pathData.map(com => { return com.type }).join('');
            let hasShorthands = /[hstv]/gi.test(commandTokens);
            hasRel = /[astvqmhlc]/g.test(commandTokens);

            if (!hasShorthands) {
                return pathData;
            }
        }

        pathData = test && hasRel ? pathDataToAbsolute(pathData, decimals) : pathData;

        let pathDataLonghand = [];
        let comPrev = {
            type: "M",
            values: pathData[0].values
        };
        pathDataLonghand.push(comPrev);

        for (let i = 1, len = pathData.length; i < len; i++) {
            let com = pathData[i];
            let { type, values } = com;
            let valuesL = values.length;
            let valuesPrev = comPrev.values;
            let valuesPrevL = valuesPrev.length;
            let [x, y] = [values[valuesL - 2], values[valuesL - 1]];
            let cp1X, cp1Y, cpN1X, cpN1Y, cpN2X, cpN2Y, cp2X, cp2Y;
            let [prevX, prevY] = [
                valuesPrev[valuesPrevL - 2],
                valuesPrev[valuesPrevL - 1]
            ];
            switch (type) {
                case "H":
                    comPrev = {
                        type: "L",
                        values: [values[0], prevY]
                    };
                    break;
                case "V":
                    comPrev = {
                        type: "L",
                        values: [prevX, values[0]]
                    };
                    break;
                case "T":
                    [cp1X, cp1Y] = [valuesPrev[0], valuesPrev[1]];
                    [prevX, prevY] = [
                        valuesPrev[valuesPrevL - 2],
                        valuesPrev[valuesPrevL - 1]
                    ];
                    // new control point
                    cpN1X = prevX + (prevX - cp1X);
                    cpN1Y = prevY + (prevY - cp1Y);
                    comPrev = {
                        type: "Q",
                        values: [cpN1X, cpN1Y, x, y]
                    };
                    break;
                case "S":

                    [cp1X, cp1Y] = [valuesPrev[0], valuesPrev[1]];
                    [prevX, prevY] = [
                        valuesPrev[valuesPrevL - 2],
                        valuesPrev[valuesPrevL - 1]
                    ];

                    [cp2X, cp2Y] =
                        valuesPrevL > 2 && comPrev.type!=='A' ?
                            [valuesPrev[2], valuesPrev[3]] :
                            [prevX, prevY];

                    // new control points
                    cpN1X = 2 * prevX - cp2X;
                    cpN1Y = 2 * prevY - cp2Y;
                    cpN2X = values[0];
                    cpN2Y = values[1];
                    comPrev = {
                        type: "C",
                        values: [cpN1X, cpN1Y, cpN2X, cpN2Y, x, y]
                    };

                    break;
                default:
                    comPrev = {
                        type: type,
                        values: values
                    };
            }
            // round final longhand values
            if (decimals > -1) {
                comPrev.values = comPrev.values.map(val => { return +val.toFixed(decimals) });
            }

            pathDataLonghand.push(comPrev);
        }
        return pathDataLonghand;
    }

    /**
     * apply shorthand commands if possible
     * L, L, C, Q => H, V, S, T
     * reversed method: pathDataToLonghands()
     */
    function pathDataToShorthands(pathData, decimals = -1, test = true) {

        /** 
        * analyze pathdata – if you're sure your data is already absolute skip it via test=false
        */
        let hasRel;
        if (test) {
            let commandTokens = pathData.map(com => { return com.type }).join('');
            hasRel = /[astvqmhlc]/g.test(commandTokens);
        }

        pathData = test && hasRel ? pathDataToAbsolute(pathData, decimals) : pathData;

        let comShort = {
            type: "M",
            values: pathData[0].values
        };

        if (pathData[0].decimals) {

            comShort.decimals = pathData[0].decimals;
        }

        let pathDataShorts = [comShort];

        let p0 = { x: pathData[0].values[0], y: pathData[0].values[1] };
        let p;
        let tolerance = 0.01;

        for (let i = 1, len = pathData.length; i < len; i++) {

            let com = pathData[i];
            let { type, values } = com;
            let valuesLast = values.slice(-2);

            // previoius command
            let comPrev = pathData[i - 1];
            let typePrev = comPrev.type;

            p = { x: valuesLast[0], y: valuesLast[1] };

            // first bezier control point for S/T shorthand tests
            let cp1 = { x: values[0], y: values[1] };

            let w = Math.abs(p.x - p0.x);
            let h = Math.abs(p.y - p0.y);
            let thresh = (w + h) / 2 * tolerance;

            let diffX, diffY, diff, cp1_reflected;

            switch (type) {
                case "L":

                    if (h === 0 || (h < thresh && w > thresh)) {

                        comShort = {
                            type: "H",
                            values: [values[0]]
                        };
                    }

                    // V
                    else if (w === 0 || (h > thresh && w < thresh)) {

                        comShort = {
                            type: "V",
                            values: [values[1]]
                        };
                    } else {

                        comShort = com;
                    }

                    break;

                case "Q":

                    // skip test
                    if (typePrev !== 'Q') {

                        p0 = { x: valuesLast[0], y: valuesLast[1] };
                        pathDataShorts.push(com);
                        continue;
                    }

                    let cp1_prev = { x: comPrev.values[0], y: comPrev.values[1] };
                    // reflected Q control points
                    cp1_reflected = { x: (2 * p0.x - cp1_prev.x), y: (2 * p0.y - cp1_prev.y) };

                    diffX = Math.abs(cp1.x - cp1_reflected.x);
                    diffY = Math.abs(cp1.y - cp1_reflected.y);
                    diff = (diffX + diffY) / 2;

                    if (diff < thresh) {

                        comShort = {
                            type: "T",
                            values: [p.x, p.y]
                        };
                    } else {
                        comShort = com;
                    }

                    break;
                case "C":

                    let cp2 = { x: values[2], y: values[3] };

                    if (typePrev !== 'C') {

                        pathDataShorts.push(com);
                        p0 = { x: valuesLast[0], y: valuesLast[1] };
                        continue;
                    }

                    let cp2_prev = { x: comPrev.values[2], y: comPrev.values[3] };

                    // reflected C control points
                    cp1_reflected = { x: (2 * p0.x - cp2_prev.x), y: (2 * p0.y - cp2_prev.y) };

                    diffX = Math.abs(cp1.x - cp1_reflected.x);
                    diffY = Math.abs(cp1.y - cp1_reflected.y);
                    diff = (diffX + diffY) / 2;

                    if (diff < thresh) {

                        comShort = {
                            type: "S",
                            values: [cp2.x, cp2.y, p.x, p.y]
                        };
                    } else {
                        comShort = com;
                    }
                    break;
                default:
                    comShort = {
                        type: type,
                        values: values
                    };
            }

            // add decimal info
            if (com.decimals || com.decimals === 0) {
                comShort.decimals = com.decimals;
            }

            // round final values
            if (decimals > -1) {
                comShort.values = comShort.values.map(val => { return +val.toFixed(decimals) });
            }

            p0 = { x: valuesLast[0], y: valuesLast[1] };
            pathDataShorts.push(comShort);
        }
        return pathDataShorts;
    }

    /**
     * based on puzrin's 
     * fontello/cubic2quad
     * https://github.com/fontello/cubic2quad/blob/master/test/cubic2quad.js
     */

    function pathDataToQuadratic(pathData, precision = 0.1) {
        pathData = pathDataToLonghands(pathData);
        let newPathData = [pathData[0]];
        for (let i = 1, len = pathData.length; i < len; i++) {
            let comPrev = pathData[i - 1];
            let com = pathData[i];
            let [type, values] = [com.type, com.values];
            let [typePrev, valuesPrev] = [comPrev.type, comPrev.values];
            let valuesPrevL = valuesPrev.length;
            let [xPrev, yPrev] = [
                valuesPrev[valuesPrevL - 2],
                valuesPrev[valuesPrevL - 1]
            ];

            // convert C to Q
            if (type == "C") {

                let quadCommands = cubicToQuad(
                    xPrev,
                    yPrev,
                    values[0],
                    values[1],
                    values[2],
                    values[3],
                    values[4],
                    values[5],
                    precision
                );

                quadCommands.forEach(comQ => {
                    newPathData.push(comQ);
                });

            } else {
                newPathData.push(com);
            }
        }
        return newPathData;
    }

    function cubicToQuad(x0, y0, cp1x, cp1y, cp2x, cp2y, px, py, precision) {

        const quadSolve = (x0, y0, cp1x) => {
            if (0 === x0)
                return 0 === y0 ? [] : [-cp1x / y0];
            let o = y0 * y0 - 4 * x0 * cp1x;
            if (Math.abs(o) < 1e-16)
                return [-y0 / (2 * x0)];
            if (o < 0)
                return [];
            let r = Math.sqrt(o);
            return [
                (-y0 - r) / (2 * x0),
                (-y0 + r) / (2 * x0)
            ];
        };

        const solveInflections = (x0, y0, cp1x, cp1y, cp2x, cp2y, px, py) => {
            return quadSolve(
                -px * (y0 - 2 * cp1y + cp2y) +
                cp2x * (2 * y0 - 3 * cp1y + py) +
                x0 * (cp1y - 2 * cp2y + py) -
                cp1x * (y0 - 3 * cp2y + 2 * py),
                px * (y0 - cp1y) +
                3 * cp2x * (-y0 + cp1y) +
                cp1x * (2 * y0 - 3 * cp2y + py) -
                x0 * (2 * cp1y - 3 * cp2y + py),
                cp2x * (y0 - cp1y) + x0 * (cp1y - cp2y) + cp1x * (-y0 + cp2y)
            )
                .filter(function (x0) {
                    return x0 > 1e-8 && x0 < 1 - 1e-8;
                })
                .sort((x0, y0) => { return x0 - y0 })

        };

        const subdivideCubic = (x0, y0, cp1x, cp1y, cp2x, cp2y, px, py, precision) => {
            let s = 1 - precision, f = x0 * s + cp1x * precision, l = cp1x * s + cp2x * precision, d = cp2x * s + px * precision, h = f * s + l * precision, p = l * s + d * precision, y = h * s + p * precision, P = y0 * s + cp1y * precision, m = cp1y * s + cp2y * precision, x = cp2y * s + py * precision, b = P * s + m * precision, v = m * s + x * precision, w = b * s + v * precision;
            return [
                [x0, y0, f, P, h, b, y, w],
                [y, w, p, v, d, x, px, py]
            ];
        };

        let s = solveInflections(x0, y0, cp1x, cp1y, cp2x, cp2y, px, py);
        let pts;
        if (!s.length) {

            pts = _cubicToQuad(x0, y0, cp1x, cp1y, cp2x, cp2y, px, py, precision);
        } else {

            for (
                var f,
                l,
                d = [],
                h = [x0, y0, cp1x, cp1y, cp2x, cp2y, px, py],
                p = 0, y = 0;
                y < s.length;
                y++
            ) {
                // subdivide the cubic bezier curve
                l = subdivideCubic(h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1 - (1 - s[y]) / (1 - p)
                );

                // compute the quadratic Bezier curve using the divided cubic segment
                f = _cubicToQuad(l[0][0], l[0][1], l[0][2], l[0][3], l[0][4], l[0][5], l[0][6], l[0][7], precision
                );

                d = d.concat(f.slice(0, -2));
                h = l[1];
                p = s[y];
            }

            // compute the quadratic Bezier curve using the cubic control points
            f = _cubicToQuad(h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], precision);
            pts = d.concat(f);
        }

        //  return pathdata commands
        let commands = [];
        for (let j = 2; j < pts.length; j += 4) {
            commands.push({
                type: "Q",
                values: [pts[j], pts[j + 1], pts[j + 2], pts[j + 3]]
            });
        }

        return commands;

        function _cubicToQuad(x0, y0, cp1x, cp1y, cp2x, cp2y, px, py, c = 0.1) {

            const calcPowerCoefficients = (p0, cp1, cp2, p) => {
                return [
                    {
                        x: (p.x - p0.x) + (cp1.x - cp2.x) * 3,
                        y: (p.y - p0.y) + (cp1.y - cp2.y) * 3
                    },
                    {
                        x: (p0.x + cp2.x) * 3 - cp1.x * 6,
                        y: (p0.y + cp2.y) * 3 - cp1.y * 6
                    },
                    {
                        x: (cp1.x - p0.x) * 3,
                        y: (cp1.y - p0.y) * 3
                    },
                    p0
                ];
            };

            const isApproximationClose = (p0, cp1, cp2, p, pointArr, precision) => {

                for (let u = 1 / pointArr.length, a = 0; a < pointArr.length; a++) {
                    if (!isSegmentApproximationClose(p0, cp1, cp2, p, a * u, (a + 1) * u, pointArr[a][0], pointArr[a][1], pointArr[a][2], precision)) {
                        return false;
                    }
                }
                return true;
            };

            const calcPoint = (p0, cp1, cp2, p, t) => {
                return {
                    x: ((p0.x * t + cp1.x) * t + cp2.x) * t + p.x,
                    y: ((p0.y * t + cp1.y) * t + cp2.y) * t + p.y,
                };
            };

            const calcPointQuad = (p0, cp1, p, t) => {
                return {
                    x: ((p0.x * t + cp1.x) * t) + p.x,
                    y: ((p0.y * t + cp1.y) * t) + p.y,
                }
            };

            const calcPointDerivative = (p0, cp1, p, k, t) => {
                return {
                    x: ((p0.x * 3 * t + cp1.x * 2) * t) + p.x,
                    y: ((p0.y * 3 * t + cp1.y * 2) * t) + p.y,
                }
            };

            const processSegment = (p0, cp1, cp2, p, t1, t2) => {

                var u = calcPoint(p0, cp1, cp2, p, t1),
                    a = calcPoint(p0, cp1, cp2, p, t2),
                    c = calcPointDerivative(p0, cp1, cp2, p, t1),
                    s = calcPointDerivative(p0, cp1, cp2, p, t2),
                    f = -c.x * s.y + s.x * c.y;

                return Math.abs(f) < 1e-8 ? [
                    u,
                    {
                        x: (u.x + a.x) / 2,
                        y: (u.y + a.y) / 2
                    },
                    a
                ]
                    : [
                        u,
                        {
                            x: (c.x * (a.y * s.x - a.x * s.y) + s.x * (u.x * c.y - u.y * c.x)) / f,
                            y: (c.y * (a.y * s.x - a.x * s.y) + s.y * (u.x * c.y - u.y * c.x)) / f
                        },
                        a
                    ];
            };

            const isSegmentApproximationClose = (p0, cp1, cp2, p, t1, t2, px, py, c, precision) => {

                const calcPowerCoefficientsQuad = (p0, cp1, p) => {
                    return [
                        { x: cp1.x * -2 + p0.x + p.x, y: cp1.y * -2 + p0.y + p.y },
                        { x: (cp1.x - p0.x) * 2, y: (cp1.y - p0.y) * 2, }, p0
                    ]
                };

                const minDistanceToLineSq = (p0, cp1, p) => {
                    let o = { x: (p.x - cp1.x), y: (p.y - cp1.y), };
                    let r = (p0.x - cp1.x) * o.x + (p0.y - cp1.y) * o.y;
                    let e = o.x * o.x + o.y * o.y;
                    let result = 0;

                    if (e != 0) {
                        result = r / e;
                    }
                    if (result <= 0) {
                        result = Math.pow((p0.x - cp1.x), 2) + Math.pow((p0.y - cp1.y), 2);
                    } else if (result >= 1) {
                        result = Math.pow((p0.x - p.x), 2) + Math.pow((p0.y - p.y), 2);
                    } else {
                        result = Math.pow((p0.x - (cp1.x + o.x * result)), 2) + Math.pow((p0.y - (cp1.y + o.y * result)), 2);
                    }

                    return result
                };

                let l, d, h, p2, y,
                    P = calcPowerCoefficientsQuad(px, py, c),
                    m = P[0],
                    x = P[1],
                    b = P[2],
                    v = precision * precision,
                    w = [],
                    g = [];

                for (l = (t2 - t1) / 10, d = 0, t = t1; d <= 10; d++, t += l) {
                    w.push(calcPoint(p0, cp1, cp2, p, t));
                }
                for (l = 0.1, d = 0, t = 0; d <= 10; d++, t += l) {
                    g.push(calcPointQuad(m, x, b, t));
                }
                for (d = 1; d < w.length - 1; d++) {
                    for (y = 1 / 0, h = 0; h < g.length - 1; h++) {
                        p2 = minDistanceToLineSq(w[d], g[h], g[h + 1]), y = Math.min(y, p2);
                    }
                    if (y > v) {
                        return false;
                    }
                }
                for (d = 1; d < g.length - 1; d++) {
                    for (y = 1 / 0, h = 0; h < w.length - 1; h++)
                        p2 = minDistanceToLineSq(g[d], w[h], w[h + 1]), y = Math.min(y, p2);
                    if (y > v)
                        return false;
                }
                return true;
            };

            for (
                f = { x: x0, y: y0 },
                l = { x: cp1x, y: cp1y },
                d = { x: cp2x, y: cp2y },
                h = { x: px, y: py },
                p = calcPowerCoefficients(f, l, d, h),
                y = p[0],
                P = p[1],
                m = p[2], x = p[3],
                b = 1; b <= 8; b++) {
                s = [];
                for (let v = 0; v < 1; v += 1 / b) {
                    s.push(processSegment(y, P, m, x, v, v + 1 / b));
                }

                let b1 = ((s[0][1].x - f.x) * (l.x - f.x)) + ((s[0][1].y - f.y) * (l.y - f.y));
                let b2 = ((s[0][1].x - h.x) * (d.x - h.x)) + ((s[0][1].y - h.y) * (d.y - h.y));

                if (
                    (1 !== b || !(b1 < 0 || b2 < 0)) &&
                    isApproximationClose(y, P, m, x, s, c)
                ) {
                    break;
                }

            }

            let pts = [s[0][0].x, s[0][0].y];
            for (let i = 0; i < s.length; i++) {
                pts.push(s[i][1].x, s[i][1].y, s[i][2].x, s[i][2].y);
            }

            return pts

        }
    }

    /** 
     * convert arctocommands to cubic bezier
     * based on puzrin's a2c.js
     * https://github.com/fontello/svgpath/blob/master/lib/a2c.js
     * returns pathData array
    */

    function arcToBezier$1(p0, values, splitSegments = 1) {
        const TAU = Math.PI * 2;
        let [rx, ry, rotation, largeArcFlag, sweepFlag, x, y] = values;

        if (rx === 0 || ry === 0) {
            return []
        }

        let phi = rotation ? rotation * TAU / 360 : 0;
        let sinphi = phi ? Math.sin(phi) : 0;
        let cosphi = phi ? Math.cos(phi) : 1;
        let pxp = cosphi * (p0.x - x) / 2 + sinphi * (p0.y - y) / 2;
        let pyp = -sinphi * (p0.x - x) / 2 + cosphi * (p0.y - y) / 2;

        if (pxp === 0 && pyp === 0) {
            return []
        }
        rx = Math.abs(rx);
        ry = Math.abs(ry);
        let lambda =
            pxp * pxp / (rx * rx) +
            pyp * pyp / (ry * ry);
        if (lambda > 1) {
            let lambdaRt = Math.sqrt(lambda);
            rx *= lambdaRt;
            ry *= lambdaRt;
        }

        /** 
         * parametrize arc to 
         * get center point start and end angles
         */
        let rxsq = rx * rx,
            rysq = rx === ry ? rxsq : ry * ry;

        let pxpsq = pxp * pxp,
            pypsq = pyp * pyp;
        let radicant = (rxsq * rysq) - (rxsq * pypsq) - (rysq * pxpsq);

        if (radicant <= 0) {
            radicant = 0;
        } else {
            radicant /= (rxsq * pypsq) + (rysq * pxpsq);
            radicant = Math.sqrt(radicant) * (largeArcFlag === sweepFlag ? -1 : 1);
        }

        let centerxp = radicant ? radicant * rx / ry * pyp : 0;
        let centeryp = radicant ? radicant * -ry / rx * pxp : 0;
        let centerx = cosphi * centerxp - sinphi * centeryp + (p0.x + x) / 2;
        let centery = sinphi * centerxp + cosphi * centeryp + (p0.y + y) / 2;

        let vx1 = (pxp - centerxp) / rx;
        let vy1 = (pyp - centeryp) / ry;
        let vx2 = (-pxp - centerxp) / rx;
        let vy2 = (-pyp - centeryp) / ry;

        // get start and end angle
        const vectorAngle = (ux, uy, vx, vy) => {
            let dot = +(ux * vx + uy * vy).toFixed(9);
            if (dot === 1 || dot === -1) {
                return dot === 1 ? 0 : Math.PI
            }
            dot = dot > 1 ? 1 : (dot < -1 ? -1 : dot);
            let sign = (ux * vy - uy * vx < 0) ? -1 : 1;
            return sign * Math.acos(dot);
        };

        let ang1 = vectorAngle(1, 0, vx1, vy1),
            ang2 = vectorAngle(vx1, vy1, vx2, vy2);

        if (sweepFlag === 0 && ang2 > 0) {
            ang2 -= Math.PI * 2;
        }
        else if (sweepFlag === 1 && ang2 < 0) {
            ang2 += Math.PI * 2;
        }

        let ratio = +(Math.abs(ang2) / (TAU / 4)).toFixed(0) || 1;

        // increase segments for more accureate length calculations
        let segments = ratio * splitSegments;
        ang2 /= segments;
        let pathDataArc = [];

        // If 90 degree circular arc, use a constant
        // https://pomax.github.io/bezierinfo/#circles_cubic
        // k=0.551784777779014
        const angle90 = 1.5707963267948966;
        const k = 0.551785;
        let a = ang2 === angle90 ? k :
            (
                ang2 === -angle90 ? -k : 4 / 3 * Math.tan(ang2 / 4)
            );

        let cos2 = ang2 ? Math.cos(ang2) : 1;
        let sin2 = ang2 ? Math.sin(ang2) : 0;
        let type = 'C';

        const approxUnitArc = (ang1, ang2, a, cos2, sin2) => {
            let x1 = ang1 != ang2 ? Math.cos(ang1) : cos2;
            let y1 = ang1 != ang2 ? Math.sin(ang1) : sin2;
            let x2 = Math.cos(ang1 + ang2);
            let y2 = Math.sin(ang1 + ang2);

            return [
                { x: x1 - y1 * a, y: y1 + x1 * a },
                { x: x2 + y2 * a, y: y2 - x2 * a },
                { x: x2, y: y2 }
            ];
        };

        for (let i = 0; i < segments; i++) {
            let com = { type: type, values: [] };
            let curve = approxUnitArc(ang1, ang2, a, cos2, sin2);

            curve.forEach((pt) => {
                let x = pt.x * rx;
                let y = pt.y * ry;
                com.values.push(cosphi * x - sinphi * y + centerx, sinphi * x + cosphi * y + centery);
            });
            pathDataArc.push(com);
            ang1 += ang2;
        }

        return pathDataArc;
    }

    /**
     * Function to simplify cubic Bézier sequences
     * thresh defines a threshold based on the 
     * segment size
     * tolerance describes a percentage based deviation 
     * comparing unoptimized against combined segment areas
     */
    function simplifyBezierSequence(chunk, tolerance = 7.5, keepDetails = true, forceCubic = false) {

        // t value for control point extrapolation
        const t = 1.333;

        // collect simplified path data commands
        let simplified = [];
        let Clen = chunk.length;
        let { type, p0, cp1, cp2 = null, p, values } = chunk[0];

        // get original chunk area for error detection
        let pathDataChunk = [{ type: 'M', values: [p0.x, p0.y] }, ...chunk];

        // unoptimized area
        let area0 = getPathArea(pathDataChunk);

        let p0_1, cp1_1, cp2_1, p_1;
        let cp1_2, cp2_2, p_2;
        let areaDiff, cp1_cubic, cp2_cubic;

        let indexEnd = chunk.length - 1;
        let indexMid = chunk.length > 2 ? Math.ceil(chunk.length / 2) - 1 : 1;

        // compare accuracy
        let accurate = false;
        let areaDiff1 = 10000;
        let areaDiff2 = 10000;
        let areaDiff3 = 10000;
        let comAreaDiff1, comAreaDiff2;
        let ptMid, cp1_cubic_1, cp2_cubic_1, cp1_cubic_2, cp2_cubic_2, cp1_cubic_3, cp2_cubic_3;
        let areaCptPoly;

        /**
         * try to replace single cubics 
         * with quadratic commands
         */

        if (!forceCubic && Clen === 1 && type === 'C') {

            let flatness = commandIsFlat([p0, cp1, cp2, p]);
            areaCptPoly = flatness.area;

            
            if (flatness.flat) {
                console.log('is flat cubic!');
                console.log(flatness, 'thresh');

                simplified = [{ type: 'L', values: [p.x, p.y] }];
                return simplified
            }

            // quadratic controlpoint
            let cpQ = checkLineIntersection(p0, cp1, p, cp2, false);
            simplified = [chunk[0]];

            if (cpQ) {
                comAreaDiff1 = getBezierAreaAccuracy([p0, cpQ, p], area0, areaCptPoly, tolerance).areaDiff;

                // can be converted to quadratic
                if (comAreaDiff1 < tolerance) {
                    simplified = [{ type: 'Q', values: [cpQ.x, cpQ.y, p.x, p.y] }];
                }
            }
            return simplified
        }

        if (Clen > 1) {

            /**
             * normalize quadratic 
             * to cubics
             */

            // convert quadratic to cubic

            if (type === 'Q') {
                chunk.forEach((com, i) => {
                    let c1 = quadratic2Cubic(com.p0, com.values);

                    let cp1 = { x: c1.values[0], y: c1.values[1] };
                    let cp2 = { x: c1.values[2], y: c1.values[3] };

                    chunk[i].type = 'C';
                    chunk[i].cp1 = cp1;
                    chunk[i].cp2 = cp2;
                    chunk[i].values = [cp1.x, cp1.y, cp2.x, cp2.y, com.p.x, com.p.y];

                });

                type = 'C';

            }

            p0_1 = chunk[1].p0;
            cp1_1 = chunk[1].cp1;
            cp2_1 = type === 'C' ? chunk[1].cp2 : null;
            p_1 = chunk[1].p;

            p_2 = chunk[indexEnd].p;
            cp1_2 = chunk[indexEnd].cp1;
            cp2_2 = type === 'C' ? chunk[indexEnd].cp2 : chunk[indexEnd].cp1;

            areaCptPoly = getPolygonArea([p0, cp1, cp2_1, p_2]);

            /**
             * check flatness of chunk
             * beziers might be linots
             */

            if (!forceCubic) {

                let chunkPoints = chunk.map(com => { return [com.p0, com.cp1, com.cp2, com.p] }).flat();
                commandIsFlat(chunkPoints);

                /*
                if (flat) {
                    let last = chunkPoints.slice(-1)[0]
                    simplified.push({ type: 'L', values: [last.x, last.y] });

                    log.push('all commands are flat')
                    return simplified
                }else{
                }
                */
            }

        }

        // 3 or more subsequent bezier segments
        if (Clen > 2) {

            /**
             * Cubics to Arcs:
             * educated guess - 
             * check if control points build a right angle
             */
            let { com, isArc, area } = cubicToArc(p0, cp1, cp2_2, p_2);
            areaDiff = getRelativeAreaDiff(area0, area);

            // arc approximations should be more precise - otherwise we prefer cubics
            if (isArc && areaDiff < tolerance * 0.75) {
                simplified = [com];
                return simplified
            }

            /**
             * more than 2 segments
             * try to interpolate tangents from
             * mid control point tangents
             */

            // get mid segment and get tangent intersection
            let p_m = chunk[indexMid].p;

            // get mit segments cps
            let cpMid_1 = type === 'C' ? chunk[indexMid].cp2 : chunk[indexMid].cp1;
            let cp1_Int = checkLineIntersection(p_m, cpMid_1, p0, cp1, false);

            if (cp1_Int) {
                let cp2_Int = checkLineIntersection(p_m, cpMid_1, p_2, cp2_2, false);
                cp1_cubic = cp1_Int;
                cp2_cubic = cp2_Int;

                // extrapolate control points
                cp1_cubic_1 = pointAtT([p0, cp1_cubic], t);
                cp2_cubic_1 = pointAtT([p_2, cp2_cubic], t);

                // test accuracy
                comAreaDiff1 = getBezierAreaAccuracy([p0, cp1_cubic_1, cp2_cubic_1, p_2], area0, areaCptPoly, tolerance);
                accurate = comAreaDiff1.accurate;
                areaDiff1 = comAreaDiff1.areaDiff;
                areaDiff = areaDiff1;

            }

            /**
             * 2nd try 
             * odd - calculate interpolated mid tangents
             */
            if (!accurate) {
                let controlPoints = type === 'C' ? [p0_1, cp1_1, cp2_1, p_1] : [p0_1, cp1_1, p_1];

                // interpolate mid point in mid segment and get cpts
                ptMid = pointAtT(controlPoints, 0.5, true, true);

                let cp1_mid = type === 'C' ? ptMid.cpts[2] : ptMid.cpts[0];
                cp1_cubic_2 = checkLineIntersection(ptMid, cp1_mid, cp1, p0, false);
                cp2_cubic_2 = checkLineIntersection(ptMid, cp1_mid, cp2_2, p_2, false);

                // extrapolate control points
                cp1_cubic_2 = pointAtT([p0, cp1_cubic_2], t);
                cp2_cubic_2 = pointAtT([p_2, cp2_cubic_2], t);

                // test accuracy
                comAreaDiff2 = getBezierAreaAccuracy([p0, cp1_cubic_2, cp2_cubic_2, p_2], area0, areaCptPoly, tolerance);
                accurate = comAreaDiff2.accurate;
                areaDiff2 = comAreaDiff2.areaDiff;

            }

            // final 
            cp1_cubic = areaDiff1 < areaDiff2 ? cp1_cubic_1 : cp1_cubic_2;
            cp2_cubic = areaDiff1 < areaDiff2 ? cp2_cubic_1 : cp2_cubic_2;
            areaDiff = areaDiff1 < areaDiff2 ? areaDiff1 : areaDiff2;

        }

        // combine 2 cubic segments
        else if (Clen === 2) {

            cp2_1 = chunk[0].cp2;
            cp2_2 = chunk[1].cp2;

            /**
             * Approach 1:
             * get combined control points
             * by extrapolating mid tangent intersection
             */

            // Get cp intersection point
            let cpI, cp1_cubicInter, cp2_cubicInter;

            cpI = checkLineIntersection(p0, cp1, cp2_2, p_2, false);
            if (cpI) {

                cp1_cubicInter = checkLineIntersection(p, cp2_1, p0, cpI, false);
                cp2_cubicInter = checkLineIntersection(p, cp1_2, p_2, cpI, false);

                // extrapolate control points
                cp1_cubic_1 = pointAtT([p0, cp1_cubicInter], t);
                cp2_cubic_1 = pointAtT([p_2, cp2_cubicInter], t);
        
                // get area to detect sign changes
                comAreaDiff1 = getBezierAreaAccuracy([p0, cp1_cubic_1, cp2_cubic_1, p_2], area0, areaCptPoly, tolerance);
        
                accurate = comAreaDiff1.accurate;
                areaDiff1 = comAreaDiff1.areaDiff;
            }

            /**
             * If Approach 1 is too imprecise:
             * Approach 2:
             * add segments' cp tangents lengths for
             * combined control points
             */

            if (!accurate) {

                // 1  distances between "tangent handles"
                let t0Length = getDistance(p0, cp1_1);
                let t1Length = getDistance(p_1, cp2_2);

                // new average tangent length
                let t2Length = t0Length + t1Length;
                let tRat0 = t2Length / t0Length;
                let tRat1 = t2Length / t1Length;

                // extrapolate cp tangents
                cp1_cubic_2 = pointAtT([p0, cp1_1], tRat0);
                cp2_cubic_2 = pointAtT([p_1, cp2_2], tRat1);

                // accuracy
                comAreaDiff2 = getBezierAreaAccuracy([p0, cp1_cubic_2, cp2_cubic_2, p_2], area0, areaCptPoly, tolerance);
                accurate = comAreaDiff2.accurate;
                areaDiff2 = comAreaDiff2.areaDiff;

                // renderPoint(svg1, cp1_cubic_2, 'cyan')
                // renderPoint(svg1, cp2_cubic_2, 'orange')

            }

            /**
             * 3rd try
             * take larger segment as reference
             */

            if (!accurate) {

                cp1 = chunk[0].cp1;
                cp2 = chunk[0].cp2;
                p = chunk[0].p;

                let controlPoints = [p0, cp1, cp2, p];

                // interpolate mid point in mid segment and get cpts
                ptMid = pointAtT(controlPoints, 0.5, true, true);

                let cp1_mid = type === 'C' ? ptMid.cpts[2] : ptMid.cpts[0];
                cp1_cubic_3 = checkLineIntersection(ptMid, cp1_mid, cp1, p0, false);
                cp2_cubic_3 = checkLineIntersection(ptMid, cp1_mid, cp2_2, p_2, false);

                // extrapolate control points
                cp1_cubic_3 = pointAtT([p0, cp1_cubic_3], t);
                cp2_cubic_3 = pointAtT([p_2, cp2_cubic_3], t);

                // test accuracy
                comAreaDiff2 = getBezierAreaAccuracy([p0, cp1_cubic_3, cp2_cubic_3, p_2], area0, areaCptPoly, tolerance);
                accurate = comAreaDiff2.accurate;
                areaDiff3 = comAreaDiff2.areaDiff;

                if (areaDiff3 < tolerance && areaDiff3 < areaDiff2) {
                    cp1_cubic_2 = cp1_cubic_3;
                    cp2_cubic_2 = cp2_cubic_3;
                    areaDiff2 = areaDiff3;
                }

            }

            // final 
            cp1_cubic = areaDiff1 < areaDiff2 ? cp1_cubic_1 : cp1_cubic_2;
            cp2_cubic = areaDiff1 < areaDiff2 ? cp2_cubic_1 : cp2_cubic_2;
            areaDiff = areaDiff1 < areaDiff2 ? areaDiff1 : areaDiff2;

        }

        // no cpts - return original
        if (!cp1_cubic || !cp2_cubic) {

            return [...chunk];

        }

        // !!! CAN be simplified
        if (areaDiff < tolerance) {

            simplified.push({ type: 'C', values: [cp1_cubic.x, cp1_cubic.y, cp2_cubic.x, cp2_cubic.y, p_2.x, p_2.y] });
        }

        // !!! no way to simplify
        else {

            simplified = chunk;

            /*
            let d = comSimple.map(com => { return `${com.type} ${com.values.join(' ')}` }).join(' ')
            let d0 = pathDataChunk.map(com => { return `${com.type} ${com.values.join(' ')}` }).join(' ')
            */

        }

        pathDataChunk.length - simplified.length;

        return simplified;
    }

    function simplifyLinetoSequence(chunk, thresh = 0.1) {

        let valuesL = chunk[0].values.slice(-2).map(val => +val.toFixed(8));
        let p0 = chunk[0].p0;

        let p = p0;
        let simplified = [];

        for (let i = 1, len = chunk.length; i < len; i++) {
            let com = chunk[i - 1];
            valuesL = com.values.slice(-2).map(val => +val.toFixed(8));
            p = { x: valuesL[0], y: valuesL[1] };

            // zero length
            if ((p.x === p0.x && p.y === p0.y)) {
                console.log('zero length', com);
                p0 = p;
                continue
            }

            // check flatness
            let comN = chunk[i];
            let valuesNL = comN.values.slice(-2);
            let pN = { x: valuesNL[0], y: valuesNL[1] };

            // check if adjacent linetos are flat
            let flatness = commandIsFlat([p0, p, pN]);
            let isFlatN = flatness.flat;

            /*
            if (!isFlatN) {
                renderPoint(svg1, p, 'orange', '0.75%')
                console.log( flatness,  thresh);
                renderPoint(svg1, p0, 'cyan', '1%', '0.5')
                renderPoint(svg1, pN, 'magenta', '0.5%')
            }
                */

            // next lineto is flat – don't add command
            if (isFlatN) {

                // check angles
                let ang1 = getAngle(p0, p, true);
                let ang2 = getAngle(p, pN, true);
                let angDiff = Math.abs(ang1 - ang2);

                if (angDiff < Math.PI / 4) {

                    continue

                }

                // update p0
            }

            p0 = p;

            simplified.push(com);
        }

        // always add last command in chunk
        simplified.push(chunk[chunk.length - 1]);

        return simplified;

    }

    /**
     * analyze path data for
     * decimal detection
     * sub paths 
     * directions
     * crucial geometry properties
     */

    function analyzePathData(pathData = [], debug = true) {

        // clone
        pathData = JSON.parse(JSON.stringify(pathData));

        // split to sub paths
        let pathDataSubArr = splitSubpaths(pathData);

        // collect more verbose data
        let pathDataPlus = [];

        // log
        let simplyfy_debug_log = [];

        /**
         * analyze sub paths
         * add simplified bbox (based on on-path-points)
         * get area
         */
        pathDataSubArr.forEach(pathData => {

            let pathDataArea = getPathArea(pathData);
            let pathPoly = getPathDataVertices(pathData);
            let bb = getPolyBBox(pathPoly);
            let { left, right, top, bottom, width, height } = bb;

            // initial starting point coordinates
            let M0 = { x: pathData[0].values[0], y: pathData[0].values[1] };
            let M = { x: pathData[0].values[0], y: pathData[0].values[1] };
            let p0 = { x: pathData[0].values[0], y: pathData[0].values[1] };
            let p;

            // init starting point data
            pathData[0].p0 = M;
            pathData[0].p = M;
            pathData[0].lineto = false;
            pathData[0].corner = false;
            pathData[0].extreme = false;
            pathData[0].directionChange = false;
            pathData[0].closePath = false;

            // add first M command
            let pathDataProps = [pathData[0]];
            let area0 = 0;
            let len = pathData.length;

            for (let c = 2; len && c <= len; c++) {

                let com = pathData[c - 1];
                let { type, values } = com;
                let valsL = values.slice(-2);

                /**
                 * get command points for 
                 * flatness checks:
                 * this way we can skip certain tests
                 */
                let commandPts = [p0];
                let isFlat = false;

                // init properties
                com.lineto = false;
                com.corner = false;
                com.extreme = false;
                com.directionChange = false;
                com.closePath = false;

                /**
                 * define angle threshold for 
                 * corner detection
                 */
                let angleThreshold = 0.05;
                p = valsL.length ? { x: valsL[0], y: valsL[1] } : M;

                // update M for Z starting points
                if (type === 'M') {
                    M = p;
                    p0 = p;

                }
                else if (type.toLowerCase() === 'z') {

                    p = M;
                }

                // add on-path points
                com.p0 = p0;
                com.p = p;

                let cp1, cp2, cp1N, cp2N, pN, typeN, area1;

                /**
                 * explicit and implicit linetos 
                 * - introduced by Z
                 */
                if (type === 'L') com.lineto = true;

                if (type === 'Z') {
                    com.closePath = true;
                    // if Z introduces an implicit lineto with a length
                    if (M.x !== M0.x && M.y !== M0.y) {
                        com.lineto = true;
                    }
                }

                // if bezier
                if (type === 'Q' || type === 'C') {
                    cp1 = { x: values[0], y: values[1] };
                    cp2 = type === 'C' ? { x: values[2], y: values[3] } : null;
                    com.cp1 = cp1;
                    if (cp2) com.cp2 = cp2;
                }

                /**
                 * check command flatness
                 * we leave it to the bezier simplifier
                 * to convert flat beziers to linetos
                 * otherwise we may strip rather flat starting segments
                 * preventing a better simplification
                 */

                if(values.length>2){
                    if (type === 'Q' || type === 'C' ) commandPts.push(cp1);
                    if (type === 'C') commandPts.push(cp2);
                    commandPts.push(p);
        
                    let commandFlatness = commandIsFlat(commandPts);
                    isFlat = commandFlatness.flat;
                    com.flat = isFlat;

                    if(isFlat){
                        com.extreme = false;
                        /*
                        pathDataProps.push(com)
                        p0 = p;
                        continue;
                        */
                    }
                }

                /**
                 * is extreme relative to bounding box 
                 * in case elements are rotated we can't rely on 90degree angles
                 * so we interpret maximum x/y on-path points as well as extremes
                 * but we ignore linetos to allow chunk compilation
                 */
                if (!isFlat && type !== 'L' && (p.x === left || p.y === top || p.x === right || p.y === bottom)) {
                    com.extreme = true;
                }

                // add to average

                let dimA = (width + height) / 2;
                com.dimA = dimA;

                let comN = pathData[c] ? pathData[c] : null;
                let comNValsL = comN ? comN.values.slice(-2) : null;
                typeN = comN ? comN.type : null;

                // get bezier control points
                if (comN) {
                    pN = comN ? { x: comNValsL[0], y: comNValsL[1] } : null;

                    if (comN.type === 'Q' || comN.type === 'C') {
                        cp1N = { x: comN.values[0], y: comN.values[1] };
                        cp2N = comN.type === 'C' ? { x: comN.values[2], y: comN.values[3] } : null;
                    }
                }

                /**
                 * Detect direction change points
                 * this will prevent distortions when simplifying
                 * e.g in the "spine" of an "S" glyph
                 */
                area1 = getPolygonArea(commandPts);
                let signChange = (area0 < 0 && area1 > 0) || (area0 > 0 && area1 < 0) ? true : false;
                // update area
                area0 = area1;

                if (signChange) {

                    com.directionChange = true;
                }

                /**
                 * check extremes or corners for adjacent curves by control point angles
                 */
                if ((type === 'Q' || type === 'C') ) {

                    if ((type === 'Q' && typeN === 'Q') || (type === 'C' && typeN === 'C')) {

                        // check extremes
                        let cpts = commandPts.slice(1);

                        let w = Math.abs(pN.x - p0.x);
                        let h = Math.abs(pN.y - p0.y);
                        let thresh = (w + h) / 2 * 0.1;
                        let pts1 = type === 'C' ? [p, cp1N, cp2N, pN] : [p, cp1N, pN];

                        let flatness2 = commandIsFlat(pts1, thresh);
                        let isFlat2 = flatness2.flat;

                        /**
                         * if current and next cubic are flat
                         * we don't flag them as extremes to allow simplification
                         */
                        let hasExtremes =  (isFlat && isFlat2) ? false : (!com.extreme ? bezierhasExtreme(p0, cpts, angleThreshold) : true);

                        if (hasExtremes) {
                            com.extreme = true;
                        }

                        // check corners
                        else {

                            let cpts1 = cp2 ? [cp2, p] : [cp1, p];
                            let cpts2 = cp2 ? [p, cp1N] : [p, cp1N];

                            let angCom1 = getAngle(...cpts1, true);
                            let angCom2 = getAngle(...cpts2, true);
                            let angDiff = Math.abs(angCom1 - angCom2) * 180 / Math.PI;

                            let cpDist1 = getSquareDistance(...cpts1);
                            let cpDist2 = getSquareDistance(...cpts2);

                            let cornerThreshold = 10;
                            let isCorner = angDiff > cornerThreshold && cpDist1 && cpDist2;

                            if (isCorner) {
                                com.corner = true;
                            }
                        }
                    }
                }

                pathDataProps.push(com);
                p0 = p;

            }

            let dimA = (width + height) / 2;
            pathDataPlus.push({ pathData: pathDataProps, bb: bb, area: pathDataArea, dimA: dimA });

            if (simplyfy_debug_log.length) {
                console.log(simplyfy_debug_log);
            }

        });

        return pathDataPlus

    }

    /**
     * scale pathData
     */

    function scalePathData(pathData, scaleX, scaleY) {
        pathData.forEach((com, i) => {
            let { type, values } = com;
            let typeRel = type.toLowerCase();

            switch (typeRel) {
                case "a":
                    com.values = [
                        values[0] * scaleX,
                        values[1] * scaleY,
                        values[2],
                        values[3],
                        values[4],
                        values[5] * scaleX,
                        values[6] * scaleY
                    ];
                    break;

                case "h":
                    com.values = [values[0] * scaleX];
                    break;

                case "v":
                    com.values = [values[0] * scaleY];
                    break;

                default:
                    if (values.length) {
                        for (let i = 0; i < values.length; i += 2) {
                            com.values[i] *=  scaleX;
                            com.values[i + 1] *= scaleY;
                        }
                    }
            }

        });
        return pathData;
    }

    function simplifyPathData(pathData, tolerance = 3, keepDetails = true, forceCubic = false, cubicToArc = true, multipass = false, debug = false) {

        // unoptimized area
        getPathArea(pathData);

        // get bbox for adjustment scaling 
        let bb = getPathDataBBox(pathData);

        let dimA = (bb.width + bb.height) / 2;
        let scale = dimA < 10 ? 100 / dimA : 1;

        // scale small paths
        if (scale != 1) pathData = scalePathData(pathData, scale, scale);

        // remove zero length commands and shift starting point
        let addExtremes = true;
        addExtremes = false;

        let removeFinalLineto = false;
        let startToTop = true;

        // show chunks

        /**
         * optimize starting point
         * remove zero length segments
         */
        pathData = cleanUpPathData(pathData, addExtremes, removeFinalLineto, startToTop, debug);

        // get verbose pathdata properties
        let pathDataPlus = analyzePathData(pathData);

        // add chunks to path object
        let pathDataPlusChunks = getPathDataPlusChunks(pathDataPlus, debug);

        // create simplified pathData
        let pathDataSimple = [];

        // loop sup path
        for (let s = 0, l = pathDataPlusChunks.length; l && s < l; s++) {
            let sub = pathDataPlusChunks[s];
            let { chunks, dimA, area } = sub;
            let len = chunks.length;
            let simplified;

            for (let i = 0; i < len; i++) {
                let chunk = chunks[i];
                let type = chunk[0].type;

                // try to convert cubic to quadratic

                
                if (!forceCubic && chunk.length === 1 && type === 'C') {
                    simplified = simplifyBezierSequence(chunk);
                    pathDataSimple.push(...simplified);

                    continue;
                }

                // nothing to combine
                if (chunk.length < 2) {
                    pathDataSimple.push(...chunk);

                    continue;
                }

                // simplify linetos
                if (type === 'L' && chunk.length > 1) {

                    simplified = simplifyLinetoSequence(chunk);
                    pathDataSimple.push(...simplified);
                }

                // Béziers
                else if (chunk.length > 1 && (type === 'C' || type === 'Q')) {

                    if (chunk.length) {

                        multipass = false;

                        chunk[0].directionChange;

                        /**
                         * prevent too aggressive simplification 
                         * e.g for quadratic glyphs
                         * by splitting large chunks in two
                         */

                        if (keepDetails && (chunk.length > 4) && !multipass) {
                            let split = Math.ceil((chunk.length - 1) / 2);
                            let chunk1 = chunk.slice(0, split);
                            let chunk2 = chunk.slice(split);

                            let simplified1 = simplifyBezierSequence(chunk1, tolerance, keepDetails, forceCubic);
                            let simplified2 = simplifyBezierSequence(chunk2, tolerance, keepDetails, forceCubic);

                            pathDataSimple.push(...simplified1, ...simplified2);
                        }

                        else {
                            simplified = simplifyBezierSequence(chunk, tolerance, keepDetails, forceCubic);
                            pathDataSimple.push(...simplified);
                        }
                    }
                }

                // No match, keep original commands
                else {

                    pathDataSimple.push(...chunk);
                }
            }
        }

        /**
         * try to replace cubics 
         * to arcs
         */

        if (cubicToArc) {

            pathDataSimple = replaceCubicsByArcs(pathDataSimple, tolerance * 0.5);

            // combine adjacent arcs
            pathDataSimple = combineArcs(pathDataSimple);

            console.log('arcs', pathDataSimple);
        }

        // rescale small paths
        if (scale != 1) pathDataSimple = scalePathData(pathDataSimple, 1 / scale, 1 / scale);

        /**
         * final area check
         * fallback to original if difference is too large
         */
        /*
        let areaS = getPathArea(pathDataSimple);
        let areaDiff = getRelativeAreaDiff(area0, areaS)

        if (areaDiff > tolerance) {

        }
            */

        /**
         * final optimization
         * simplify adjacent linetos
         * optimize start points
         * we done it before 
         * but we need to apply this again to 
         * avoid unnecessary close linetos
         */

        // prefer first lineto to allow implicit closing linetos by "Z"
        removeFinalLineto = true;
        startToTop = false;
        addExtremes = false;
        debug = false;

        pathDataSimple = cleanUpPathData(pathDataSimple, addExtremes, removeFinalLineto, startToTop, debug);
        console.log('pathDataSimple post', pathDataSimple);

        return pathDataSimple;
    }

    /**
     * converts all commands to absolute
     * optional: convert shorthands; arcs to cubics 
     */

    function convertPathData(pathData,
        {
            normalize = null,
            optimize = 1,
            toAbsolute = true,
            toRelative = false,
            quadraticToCubic = false,
            lineToCubic = false,
            toLonghands = true,
            toShorthands = false,
            arcToCubic = false,
            arcParam = false,
            arcAccuracy = 1,

            optimizeOrder = false,
            reorderSub = false,

            // simplify options
            simplify = false,
            tolerance = 7.5,
            keepDetails = true,
            forceCubic = false,
            cubicToArc = true,
            // maybe ditched
            multipass = false,

            cubicToQuadratic = false,
            cubicToQuadraticPrecision = 0.1,
            decimals = -1,
            cubicToArcs = false

        } = {}

    ) {

        if (normalize === true) {
            toAbsolute = true;
            toLonghands = true;
            arcToCubic = true;
            quadraticToCubic = true;
            toShorthands = false;
        }

        // clone normalized pathdata array to keep original
        pathData = JSON.parse(JSON.stringify(pathData));

        // convert to absolute
        if (toAbsolute) pathData = pathDataToAbsolute(pathData);

        // convert to longhands
        if (toLonghands) pathData = pathDataToLonghands(pathData, -1, false);

        // simpify

        if (simplify) {
            // original area
            getPathArea(pathData);

            /*
            if (multipass) {
                // try with less details
                pathDataSimpl_low = JSON.parse(JSON.stringify(pathData));
                keepDetails = false;
                tolerance = tolerance * 1.25

                pathDataSimpl_low = simplifyPathData(pathDataSimpl_low, tolerance, keepDetails, multipass);
                area1 = getPathArea(pathDataSimpl_low);
                areaDiff1 = getRelativeAreaDiff(area0, area1)

                // higher accuracy
                keepDetails = true;
                tolerance = 7.5
                pathData = simplifyPathData(pathData, tolerance, keepDetails, multipass);
                area2 = getPathArea(pathData);
                areaDiff2 = getRelativeAreaDiff(area0, area2)

                // sloppier simplification is better
                if (areaDiff1 < areaDiff2) {
                    pathData = pathDataSimpl_low
                }
            }
            */

            pathData = simplifyPathData(pathData, tolerance, keepDetails, forceCubic, cubicToArc, multipass);

        }

        // pre-round get suitable decimal accuracy
        pathData = detectAccuracy(pathData);

        // test if cubics can be converted to arcs
        if (cubicToArcs && !arcToCubic) pathData = pathDataCubicToArc(pathData);

        // quadratic to cubic 
        if (quadraticToCubic) pathData = pathDataQuadraticToCubic(pathData);

        // cubic to quadratic 
        if (cubicToQuadratic) pathData = pathDataToQuadratic(pathData, cubicToQuadraticPrecision);

        // arct to cubic
        if (arcToCubic) pathData = pathDataArcsToCubics(pathData);

        // override rounding for testing

        // pre round
        if (decimals !== -1) {

            pathData = roundPathData(pathData, decimals);
        }

        // to shorthands

        if (toShorthands) pathData = pathDataToShorthands(pathData);

        // to Relative

        if (toRelative) pathData = pathDataToRelative(pathData);

        // round if not already rounded

        // post round
        if (decimals !== -1) {

            pathData = roundPathData(pathData, decimals);
        }

        return pathData;
    }

    /**
     * Serialize pathData array to a minified "d" attribute string.
     */
    function pathDataToD(pathData, optimize = 1) {

        let beautify = optimize>1;
        let minify = beautify ? false : true;

        // Convert first "M" to "m" if followed by "l" (when minified)
        if (pathData[1].type === "l" && minify) {
            pathData[0].type = "m";
        }

        let d = '';
        if(beautify) {
            d = `${pathData[0].type} ${pathData[0].values.join(" ")}\n`;
        }else {
            d = `${pathData[0].type}${pathData[0].values.join(" ")}`;
        }

        for (let i = 1, len = pathData.length; i < len; i++) {
            let com0 = pathData[i - 1];
            let com = pathData[i];
            let { type, values } = com;

            // Minify Arc commands (A/a) – actually sucks!
            if (minify && (type === 'A' || type === 'a')) {
                values = [
                    values[0], values[1], values[2],
                    `${values[3]}${values[4]}${values[5]}`,
                    values[6]
                ];
            }

            // Omit type for repeated commands
            type = (com0.type === com.type && com.type.toLowerCase() !== 'm' && minify)
                    ? " "
                    : (
                        (com0.type === "m" && com.type === "l") ||
                        (com0.type === "M" && com.type === "l") ||
                        (com0.type === "M" && com.type === "L")
                    ) && minify
                        ? " "
                        : com.type;

            // concatenate subsequent floating point values
            if (minify) {

                let valsString = '';
                let prevWasFloat = false;

                for (let v = 0, l = values.length; v < l; v++) {
                    let val = values[v];
                    let valStr = val.toString();
                    let isFloat = valStr.includes('.');
                    let isSmallFloat = isFloat && Math.abs(val) < 1;

                    // Remove leading zero from small floats *only* if the previous was also a float
                    if (isSmallFloat && prevWasFloat) {
                        valStr = valStr.replace(/^0\./, '.');
                    }

                    // Add space unless this is the first value OR previous was a small float
                    if (v > 0 && !(prevWasFloat && isSmallFloat)) {
                        valsString += ' ';
                    }

                    valsString += valStr;

                    prevWasFloat = isSmallFloat;
                }

                d += `${type}${valsString}`;

            }
            // regular non-minified output
            else {
                if(beautify) {
                    d += `${type} ${values.join(' ')}\n`;
                }else {
                    d += `${type}${values.join(' ')}`;
                }
            }
        }

        if (minify) {
            d = d
                .replace(/ 0\./g, " .") // Space before small decimals
                .replace(/ -/g, "-")     // Remove space before negatives
                .replace(/-0\./g, "-.")  // Remove leading zero from negative decimals
                .replace(/Z/g, "z");     // Convert uppercase 'Z' to lowercase
        }

        return d;
    }

    function SVGiiSimplify_core(d, {
        toAbsolute = false,
        toRelative = true,
        quadraticToCubic = false,
        toLonghands = false,
        toShorthands = true,
        arcToCubic = false,
        simplify = true,
        tolerance = 3,
        keepDetails = true,
        forceCubic=false, 
        cubicToArc= true,
        // maybe ditched
        multipass = false,
        cubicToQuadratic = false,
        cubicToQuadraticPrecision = 0.1,
        decimals = 'auto',
        minify = 1
    } = {}) {

        let optionsNorm = {
            toAbsolute: true,
            toLonghands: true,
            arcToCubic: false
        };

        let pathData = parse(d).pathData;

        let pathDataNorm = convertPathData(pathData, optionsNorm);

        // clone
        let pathDataSimple = JSON.parse(JSON.stringify(pathDataNorm));

        let optionsSimple = {

            simplify: simplify,
            tolerance: tolerance,
            keepDetails: keepDetails,
            forceCubic,
            cubicToArc,

            // minifying
            toShorthands: toShorthands,
            toRelative: toRelative,
            decimals: decimals,
            minify: minify,
            multipass
        };
        pathDataSimple = convertPathData(pathData, optionsSimple);

        // stringify
        let dSimple = pathDataToD(pathDataSimple);

        this.pathData = pathData;
        this.pathDataSimple = pathDataSimple;
        this.d = dSimple;

    }

    // Self-executing function for IIFE
    if (typeof window !== 'undefined') {
        window.SVGiiSimplify = SVGiiSimplify_core;
    }

    // just a convenience copy of "toD"
    SVGiiSimplify.prototype.toString = function (optimize = 1) {
        let pathData = this.pathDataSimple.length ? this.pathDataSimple : this.pathData;
        

        this.d = pathDataToD(pathData, optimize);
        return this.d;
    };

    // just a convenience copy of "toD"
    SVGiiSimplify.prototype.getPathData = function () {
        let pathData = this.pathDataSimple.length ? this.pathDataSimple : this.pathData;
        return pathData;
    };

    // just a convenience copy of "toD"
    SVGiiSimplify.prototype.getPathDataNorm = function () {
        return this.pathData;};

    exports.SVGiiSimplify = SVGiiSimplify_core;

})(this.SVGiiSimplify = this.SVGiiSimplify || {});
