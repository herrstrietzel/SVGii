
/**
 * split path data into chunks 
 * to detect subsequent cubic segments 
 * that could be  combined
 */

import { getAngle } from "./geometry";
import { renderPoint } from "./visualize";

export function getPathDataChunks(pathData) {

    // get segment properties
    pathData = JSON.parse(JSON.stringify(pathData));

    let M = { x: pathData[0].values[0], y: pathData[0].values[1] }
    let p0 = { x: M.x, y: M.y }
    let p;

    let pathDataProps = [];
    let lastType = ''


    for (let c = 1, len = pathData.length; len && c < len; c++) {

        let showPts = false

        let com = pathData[c - 1];
        let { type, values } = com;
        let valsL = values.slice(-2);
        com.split = false;
        com.extreme = false;
        com.corner = false;
        let tolerance = Math.PI / 180 * 1.1
        tolerance = 0.05
        //console.log(tolerance);

        p0 = valsL[0] ? { x: valsL[0], y: valsL[1] } : p0;
        p = { x: valsL[0], y: valsL[1] };

        //next command
        let comN = pathData[c]
        let typeN = comN.type

        if (type === 'M') {
            M = p;
        }
        else if (type === 'Z') {
            p = M;
        }

        com.p0 = p0;
        com.p = p;


        if (type !== 'Z' && type !== lastType && typeN !== type) {
            com.split = true;
            //console.log(type, lastType );
            if(showPts) renderPoint(svg1, p0, 'green', '1.5%', '1', lastType + '-' + type)
        }


        if (type === 'Q' || type === 'C') {
            let cp1 = { x: values[0], y: values[1] }
            let cp1N = { x: comN.values[0], y: comN.values[1] }
            let cp2 = type === 'C' ? { x: values[2], y: values[3] } : null;
            let cp2N = type === 'C' ? { x: comN.values[2], y: comN.values[3] } : null;
            //let pN = type === 'C' ? { x: comN.values[4], y: comN.values[5] } : { x: comN.values[2], y: comN.values[3] };

            com.cp1 = cp1
            if(cp2) com.cp2 = cp2;


            // check extremes or corners for adjacent curves
            if ((type === 'Q' && typeN === 'Q') || (type === 'C' && typeN === 'C')) {


                let ang1 = getAngle(p0, cp1, true);
                let ang2 = cp2 ? getAngle(cp2, p, true) : 0;

                let PIquarter = Math.PI * 0.5;
                let extCp1 = Math.abs((ang1 % PIquarter)) < tolerance ||
                    Math.abs((ang1 % PIquarter) - PIquarter) < tolerance;

                let extCp2 = cp2N ? Math.abs((ang2 % PIquarter)) < tolerance ||
                    Math.abs((ang2 % PIquarter) - PIquarter) < tolerance : false;

                // type change
                if (type !== lastType) com.split = true


                // is extreme
                if (extCp1 || extCp2) {
                    if(showPts){
                        if (extCp1) renderPoint(svg1, p, 'cyan', '1%')
                        if (extCp2) renderPoint(svg1, p, 'orange', '1%')

                    }
                    if (extCp1) renderPoint(svg1, p, 'cyan', '1%')

                    com.extreme = true
                    com.split = true
                } else {


                    // check corners
                    //let ang3 = getAngle(p, cp1N);
                    let ang3 = getAngle(cp1, p, true);
                    let ang4 = getAngle(p, cp1N, true);
                    let ang5 = cp2 ? getAngle(cp2, p, true) : 0;
                    let ang6 = cp2 ? getAngle(p, cp1N, true) : 0;

                    let diffA1 = Math.abs(ang4 - ang3)
                    let diffA2 = cp2 ? Math.abs(ang6 - ang5) : 0

                    let isCorner = type === 'C' ? cp2 && diffA2 > tolerance : diffA1 > tolerance

                    //let isCorner = diffA1 > 0.1
                    //renderPoint(svg1, p, 'magenta', '1%')


                    if (isCorner) {

                        //console.log( diffA2, tolerance, ang6, ang5);
                        renderPoint(svg1, p, 'magenta', '1%')
                        com.isCorner = true
                        com.split = true
                    }

                }
            }
        }


        //console.log(com);
        pathDataProps.push(com)

        // update type
        lastType = type;

    }

    // combine in chunks
    let pathDataChunks = [[pathDataProps[0]], []];
    let ind = 1

    for (let i = 1, len = pathDataProps.length; i < len; i++) {

        let com = pathDataProps[i];
        let { split, extreme, corner } = com;
        if (split) {
            if (pathDataChunks[ind].length) {
                pathDataChunks.push([]);
                ind++
            }
            // console.log(pathDataChunks);
        }
        pathDataChunks[ind].push(com)

    }

    console.log(pathDataChunks);
    console.log(pathDataProps);

    return pathDataChunks
}


export function getPathDataChunks0(pathData) {
    pathData = JSON.parse(JSON.stringify(pathData));

    let p0 = { x: pathData[0].values[0], y: pathData[0].values[1] };
    let M = { x: pathData[0].values[0], y: pathData[0].values[1] };
    pathData[0].p0 = p0;
    pathData[0].p = p0;
    let len = pathData.length;
    let lastType = 'M';
    //let lastChunk = chunks[chunks.length - 1];

    let chunks = [[pathData[0]]];
    let ind = 0;


    for (let c = 2; c < len; c++) {
        let com = pathData[c - 1];
        let { type, values } = com;
        let valsL = values.slice(-2);
        let p = { x: valsL[0], y: valsL[1] };
        let comN = pathData[c] || com;

        com.p0 = p0;
        com.p = p;

        let wasExtreme = false
        let wasCorner = false

        //let shouldSplit = type !== lastType;

        // new type add chunk
        if (type !== lastType) {
            //console.log('new', c, type);
            chunks.push([])
            ind++
        }

        if (type === 'M') {
            M = p;
        } else if (type.toLowerCase() === 'z') {
            com.p = M;
        }


        if (type === 'C' || type === 'Q') {
            let cp1 = { x: values[0], y: values[1] };
            let cp2 = type === 'C' ? { x: values[2], y: values[3] } : null;

            let xMax = Math.max(p0.x, p.x);
            let xMin = Math.min(p0.x, p.x);
            let yMax = Math.max(p0.y, p.y);
            let yMin = Math.min(p0.y, p.y);
            let w = xMax - xMin;
            let h = yMax - yMin;
            let thresh = Math.min(w, h) * 0.05;

            let isExtremeCp1 = Math.abs(p0.x - cp1.x) < thresh || Math.abs(p0.y - cp1.y) < thresh;
            let isExtremeCp2 = cp2 && (Math.abs(p.x - cp2.x) < thresh || Math.abs(p.y - cp2.y) < thresh);

            let cp1N = { x: comN.values[0], y: comN.values[1] };
            let betweenH = (cp1.x < p.x && cp1N.x > p.x) || (cp1.x > p.x && cp1N.x < p.x);
            let betweenV = (cp1.y < p.y && cp1N.y > p.y) || (cp1.y > p.y && cp1N.y < p.y);
            let isCorner = (betweenH && (cp1.y < p.y || cp1.y > p.y)) || (betweenV && (cp1.x < p.x || cp1.x > p.x));

            com.cp1 = cp1;
            if (cp2) com.cp2 = cp2;
            com.isExtremeCp1 = isExtremeCp1;
            com.isExtremeCp2 = isExtremeCp2;
            com.isCorner = isCorner;

            if (isCorner) {
                renderPoint(svg1, p, 'magenta', '1%')
            }


            if (isCorner || isExtremeCp1 || isExtremeCp2) {
                //shouldSplit = true;
                //console.log(chunks);
                if (chunks[ind].length) {
                    chunks.push([])
                    ind++
                }
                chunks[ind].push(com)
                //chunks[ind].push(com)

                lastType = type;
                p0 = type.toLowerCase() === 'z' ? M : p;
                continue

                //ind++

            }

        }



        /*
        if (shouldSplit) {
            chunks.push([]);
            lastChunk = chunks[chunks.length - 1];
        }
        */

        // add to chunk
        chunks[ind].push(com)

        //lastChunk.push(com);
        lastType = type;
        p0 = type.toLowerCase() === 'z' ? M : p;
    }

    return chunks;
}






