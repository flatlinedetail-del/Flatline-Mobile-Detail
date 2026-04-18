import * as fs from 'fs';

const path = 'src/components/MapZoneEditor.tsx';
let source = fs.readFileSync(path, 'utf8');

// 1. Add DrawingManager import
source = source.replace(
  'import { GoogleMap, Polygon, Polyline, Circle } from "@react-google-maps/api";',
  'import { GoogleMap, Polygon, Polyline, Circle, DrawingManager } from "@react-google-maps/api";'
);

// We will change the component later. Let's see if we can do this faster. 
