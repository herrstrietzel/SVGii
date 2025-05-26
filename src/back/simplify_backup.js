
/**
 * split path data into chunks 
 * to detect subsequent cubic segments 
 * that could be  combined
 */

import { renderPoint } from "./visualize";

export function getPathDataChunks0(pathData) {

    pathData = JSON.parse(JSON.stringify(pathData));

    let p0 = { x: pathData[0].values[0], y: pathData[0].values[1] };
    let M = { x: pathData[0].values[0], y: pathData[0].values[1] };
    pathData[0].p0 = p0;
    pathData[0].p = p0;
    let chunks = [[pathData[0]]];
    let len = pathData.length;
    let lastType = 'M';
    let lastChunk = chunks[chunks.length - 1];

    //let isCorner = false;
    let addNewChunk = false;


    for (let c = 2; len && c <= len; c++) {
        let com = pathData[c - 1];
        let { type, values } = com;
        let valsL = values.slice(-2);
        //let p = valsL[0] ? { x: valsL[0], y: valsL[1] } : p0;
        let p = { x: valsL[0], y: valsL[1] };

        //next command
        let comN = pathData[c] ? pathData[c] : com;
        //let typeN = pathData[c] ? comNext.type : type;

        com.p0 = p0;
        com.p = p;


        // different type add chunk
        if (type !== lastType || addNewChunk) {
            chunks.push([])
            lastChunk = chunks[chunks.length - 1];
            addNewChunk = false
            //renderPoint(svg, p, 'orange', '1%', '0.5' )
            //console.log(type, lastType);
        }


        if (type === 'M') {
            M = p;
        }

        else if (type.toLowerCase() === 'z') {
            com.p = M;
        }


        else if (type === 'C') {
            let cp1 = { x: values[0], y: values[1] };
            let cp2 = { x: values[2], y: values[3] };
            let p = { x: valsL[0], y: valsL[1] };




            // detect extremes
            let xMax = Math.max(p0.x, p.x)
            let xMin = Math.min(p0.x, p.x)
            let yMax = Math.max(p0.y, p.y)
            let yMin = Math.min(p0.y, p.y)
            let w = xMax - xMin
            let h = yMax - yMin

            let thresh = Math.min(w, h) * 0.05



            let diffX = Math.abs(p0.x - cp1.x)
            let diffY = Math.abs(p0.y - cp1.y)

            let diffX1 = Math.abs(p.x - cp2.x)
            let diffY1 = Math.abs(p.y - cp2.y)

            let isExtremeCp1 = diffX < thresh || diffY < thresh;
            let isExtremeCp2 = diffX1 < thresh || diffY1 < thresh;

            if (isExtremeCp1) {
                //renderPoint(svg, cp1, 'orange', '1%', '0.5' )
                //renderPoint(svg, p0, 'orange', '1%', '0.5' )
            }

            if (isExtremeCp2) {
                //renderPoint(svg, cp2, 'magenta', '1%', '0.5' )
                //renderPoint(svg, p, 'magenta', '1%', '0.5' )
            }


            // add to object
            com.cp1 = cp1;
            com.cp2 = cp2;
            com.isExtremeCp2 = isExtremeCp2;
            com.isExtremeCp1 = isExtremeCp1;
            com.isCorner = false;


            /**
             * detect corners
             * to be skipped when simplifying
            */
            let cp1N = comN.values[0] ? { x: comN.values[0], y: comN.values[1] } : p;

            let above = (cp2.y < p.y && cp1N.y < p.y)
            let below = (cp2.y > p.y && cp1N.y > p.y)
            let right = (cp2.x > p.x && cp1N.x > p.x)
            let left = (cp2.x < p.x && cp1N.x < p.x)
            let betweenH = (cp2.x < p.x && cp1N.x > p.x) || (cp2.x > p.x && cp1N.x < p.x)
            let betweenV = (cp2.y < p.y && cp1N.y > p.y) || (cp2.y > p.y && cp1N.y < p.y)


            if (
                (betweenH && above) || (betweenH && below) ||
                (betweenV && left) || (betweenV && right)

            ) {
                //next commands are added to new chunk
                addNewChunk = true;
                //renderPoint(svg, p, 'red', '3%', '0.5' )
            }


            /**
             * split at exterme points
             */
            else if ((isExtremeCp1) && lastChunk.length) {
                chunks.push([])
                lastChunk = chunks[chunks.length - 1];
                //renderPoint(svg, p0, 'red', '3%', '0.5' )


            }

        } // end C


        else if (type === 'Q') {
            let cp1 = { x: values[0], y: values[1] };
            let p = { x: valsL[0], y: valsL[1] };


            // detect extremes
            let xMax = Math.max(p0.x, p.x)
            let xMin = Math.min(p0.x, p.x)
            let yMax = Math.max(p0.y, p.y)
            let yMin = Math.min(p0.y, p.y)
            let w = xMax - xMin
            let h = yMax - yMin

            let thresh = (w+h)/2 * 0.01


            let diffX = Math.abs(p0.x - cp1.x)
            let diffY = Math.abs(p0.y - cp1.y)

            let isExtremeCp1 = diffX < thresh || diffY < thresh;

            // add to object
            com.cp1 = cp1;
            com.isExtremeCp1 = isExtremeCp1;
            com.isCorner = false;


            /**
             * detect corners
             * to be skipped when simplifying
            */
            let cp1N = comN.values[0] ? { x: comN.values[0], y: comN.values[1] } : p;
            let above = (cp1.y < p.y && cp1N.y < p.y)
            let below = (cp1.y > p.y && cp1N.y > p.y)
            let right = (cp1.x > p.x && cp1N.x > p.x)
            let left = (cp1.x < p.x && cp1N.x < p.x)
            let betweenH = (cp1.x < p.x && cp1N.x > p.x) || (cp1.x > p.x && cp1N.x < p.x)
            let betweenV = (cp1.y < p.y && cp1N.y > p.y) || (cp1.y > p.y && cp1N.y < p.y)


            if (
                (betweenH && above) || (betweenH && below) ||
                (betweenV && left) || (betweenV && right)

            ) {
                //next commands are added to new chunk
                addNewChunk = true;
                com.isCorner = true;
                chunks.push([])
                lastChunk = chunks[chunks.length - 1];

                //renderPoint(svg1, p, 'red', '3%', '0.5' )
            }


            /**
             * split at extremr points
             */
            //|| isExtremeCp2
            else if ((isExtremeCp1 ) && lastChunk.length) {
                chunks.push([])
                lastChunk = chunks[chunks.length - 1];
                //renderPoint(svg, p0, 'red', '3%', '0.5' )
            }

        } // end Q


        // add data to last chunk
        lastChunk.push(com)
        lastType = type

        // new previous starting point
        p0 = type.toLowerCase() === 'z' ? M : { x: valsL[0], y: valsL[1] };

    }

    return chunks

}


export function getPathDataChunks(pathData) {
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
        let com = pathData[c-1];
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
        if(type !== lastType ){
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

            if(isCorner){
                renderPoint(svg1, p, 'magenta', '1%')
            }


            if (isCorner || isExtremeCp1 || isExtremeCp2) {
                //shouldSplit = true;
                //console.log(chunks);
                if(chunks[ind].length){
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






