import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { GoogleMap, Polygon, Circle, DrawingManager } from "@react-google-maps/api";
import { useGoogleMaps } from "./GoogleMapsProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Map as MapIcon, Crosshair, Maximize2, Minimize2, Circle as CircleIcon } from "lucide-react";
import { MapZone } from "../types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MapZoneEditorProps {
  baseLat: number;
  baseLng: number;
  zones: MapZone[];
  onSave: (zones: MapZone[]) => void;
}

const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function MapZoneEditor({ baseLat, baseLng, zones: initialZones, onSave }: MapZoneEditorProps) {
  const { isLoaded } = useGoogleMaps();
  const [zones, setZones] = useState<MapZone[]>(initialZones || []);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  useEffect(() => {
    setZones(initialZones || []);
  }, [initialZones]);

  const [drawingMode, setDrawingMode] = useState<google.maps.drawing.OverlayType | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonRefs = useRef<{ [key: string]: google.maps.Polygon }>({});

  // Force map to resize when container changes
  useEffect(() => {
    if (mapRef.current && window.google) {
      setTimeout(() => {
        window.google.maps.event.trigger(mapRef.current, 'resize');
      }, 100);
    }
  }, [isExpanded, isSidebarVisible]);

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    
    // Auto-fit zones on load if they exist
    if (initialZones && initialZones.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      initialZones.forEach(zone => {
        if (zone.type === 'circle' && zone.center) {
          const circle = new window.google.maps.Circle({ center: zone.center, radius: zone.radius });
          bounds.union(circle.getBounds()!);
        } else if (zone.paths && zone.paths.length > 0) {
          zone.paths.forEach(p => bounds.extend(p));
        }
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
      }
    }
  }, [initialZones]);

  const handlePolygonEdit = useCallback((id: string) => {
    const polygon = polygonRefs.current[id];
    if (polygon) {
      const path = polygon.getPath();
      const newPaths = path.getArray().map((p: any) => ({
        lat: p.lat(),
        lng: p.lng()
      }));
      setZones(prev => {
        const updated = prev.map(z => z.id === id ? { ...z, paths: newPaths } : z);
        return updated;
      });
    }
  }, []);

  const handleCircleEdit = useCallback((id: string, center: google.maps.LatLng | null, radius: number) => {
    if (!center) return;
    const newLat = center.lat();
    const newLng = center.lng();
    
    setZones(prev => {
      const zone = prev.find(z => z.id === id);
      if (!zone || !zone.center || !zone.radius) return prev;
      
      const latDiff = Math.abs(zone.center.lat - newLat);
      const lngDiff = Math.abs(zone.center.lng - newLng);
      const radDiff = Math.abs(zone.radius - radius);
      
      if (latDiff < 0.0000001 && lngDiff < 0.0000001 && radDiff < 0.01) {
        return prev;
      }
      
      return prev.map(z => z.id === id ? { 
        ...z, 
        center: { lat: newLat, lng: newLng },
        radius: radius
      } : z);
    });
  }, []);

  const handleUpdateZone = (id: string, updates: Partial<MapZone>) => {
    setZones(prev => prev.map(z => z.id === id ? { ...z, ...updates } : z));
  };

  const handleDeleteZone = (id: string) => {
    const updatedZones = zones.filter(z => z.id !== id);
    setZones(updatedZones);
    onSave(updatedZones); // Immediate Persistence
    if (selectedZoneId === id) setSelectedZoneId(null);
  };

  const handleSave = () => {
    onSave(zones);
    toast.success("Service zones captured and synchronized.");
  };

  const onPolygonComplete = useCallback((polygon: google.maps.Polygon) => {
    const path = polygon.getPath().getArray().map((p: any) => ({
      lat: p.lat(),
      lng: p.lng()
    }));
    
    polygon.setMap(null); // remove drawing manager line
    
    const zoneId = Math.random().toString(36).substr(2, 9);
    const newZone: MapZone = {
      id: zoneId,
      name: `New Zone ${zones.length + 1}`,
      fee: 0,
      color: COLORS[zones.length % COLORS.length],
      type: 'polygon',
      paths: path
    };
    
    setZones(prev => [...prev, newZone]);
    setSelectedZoneId(newZone.id);
    setDrawingMode(null);
  }, [zones]);

  const onCircleComplete = useCallback((circle: google.maps.Circle) => {
    const center = circle.getCenter();
    const radius = circle.getRadius();
    
    circle.setMap(null); // remove drawing manager line
    
    if (!center) return;
    
    const zoneId = Math.random().toString(36).substr(2, 9);
    const newZone: MapZone = {
      id: zoneId,
      name: `New Zone ${zones.length + 1}`,
      fee: 0,
      color: COLORS[zones.length % COLORS.length],
      type: 'circle',
      center: { lat: center.lat(), lng: center.lng() },
      radius: radius
    };
    
    setZones(prev => [...prev, newZone]);
    setSelectedZoneId(newZone.id);
    setDrawingMode(null);
  }, [zones]);
  
  // Attach listeners to path
  const handlePolygonLoad = useCallback((polygon: google.maps.Polygon, id: string) => {
      polygonRefs.current[id] = polygon;
      const path = polygon.getPath();
      if (path) {
          google.maps.event.clearInstanceListeners(path);
          google.maps.event.addListener(path, 'set_at', () => handlePolygonEdit(id));
          google.maps.event.addListener(path, 'insert_at', () => handlePolygonEdit(id));
          google.maps.event.addListener(path, 'remove_at', () => handlePolygonEdit(id));
      }
  }, [handlePolygonEdit]);

  if (!isLoaded) return <div className="h-full w-full bg-black flex items-center justify-center text-white/50">Loading interface...</div>;

  const EditorLayout = (
    <div className={cn(
      "flex bg-black overflow-hidden border border-white/10 rounded-3xl transition-all duration-500",
      isExpanded ? "fixed inset-0 z-[9999] rounded-none border-none" : "h-full w-full relative"
    )}>
      <div className={cn(
        "border-r border-white/10 flex flex-col bg-gray-900 transition-all duration-500",
        isSidebarVisible ? "w-80 opacity-100" : "w-0 opacity-0 invisible"
      )}>
        <div className="p-6 border-b border-white/5">
          <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-primary" />
            Service Grid
          </h3>
          <p className="text-[10px] text-white/40 font-bold uppercase mt-1">Define geographical pricing boundaries</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {zones.map(zone => (
            <div 
              key={zone.id}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                selectedZoneId === zone.id ? "bg-primary/10 border-primary" : "bg-white/5 border-white/5 hover:border-white/20"
              }`}
              onClick={() => setSelectedZoneId(zone.id)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">{zone.name}</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-gray-500 hover:text-red-500"
                  onClick={(e) => { e.stopPropagation(); handleDeleteZone(zone.id); }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-white/40">Zone Alias</Label>
                  <Input 
                    value={zone.name}
                    onChange={(e) => handleUpdateZone(zone.id, { name: e.target.value })}
                    className="bg-black/40 border-white/10 h-8 text-[11px] font-bold text-white rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[9px] font-black uppercase tracking-widest text-white/40">Travel Premium ($)</Label>
                  <Input 
                    type="number"
                    value={zone.fee}
                    onChange={(e) => handleUpdateZone(zone.id, { fee: Number(e.target.value) })}
                    className="bg-black/40 border-white/10 h-8 text-[11px] font-bold text-white rounded-lg"
                  />
                </div>
              </div>
            </div>
          ))}
          
          {zones.length === 0 && (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto">
                <Crosshair className="w-6 h-6 text-white/20" />
              </div>
              <p className="text-[10px] text-white/40 font-black uppercase tracking-widest px-8">No zones detected. Use the draw tools on the map to define service areas.</p>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-white/5 bg-black/40">
           <Button 
             className="w-full bg-white hover:bg-white text-black font-black uppercase tracking-widest h-12 rounded-xl text-xs"
             onClick={handleSave}
           >
             Save Service Zones
           </Button>
        </div>
      </div>

      <div className="flex-1 relative">
        <GoogleMap
          mapContainerClassName="w-full h-full"
          center={{ lat: baseLat, lng: baseLng }}
          zoom={10}
          onLoad={handleMapLoad}
          onClick={() => {
            if (drawingMode === null) {
              setSelectedZoneId(null);
            }
          }}
          options={{
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeId: 'roadmap',
            // Disable map dragging entirely when a zone is selected or we're drawing
            // This ensures vertex dragging always wins
            draggable: selectedZoneId === null && drawingMode === null,
            // Use cooperative mode when selected to allow two-finger pan on mobile 
            // but prevent accidental one-finger pan while editing points
            gestureHandling: (selectedZoneId !== null || drawingMode !== null) ? 'cooperative' : 'greedy',
          }}
        >
          <div className="absolute top-6 left-6 z-10 flex items-center gap-2 p-1.5 bg-black/80 backdrop-blur-md rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto">
              <Button 
                variant="ghost"
                className={cn(
                  "font-black h-11 px-6 rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95",
                  window.google && drawingMode === window.google.maps.drawing.OverlayType.POLYGON 
                    ? "bg-primary text-white" 
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
                onClick={() => {
                  if (!window.google) return;
                  setDrawingMode(
                      drawingMode === window.google.maps.drawing.OverlayType.POLYGON 
                          ? null 
                          : window.google.maps.drawing.OverlayType.POLYGON
                  );
                  setSelectedZoneId(null);
                }}
              >
                <Plus className="w-4 h-4 mr-2" /> Draw Polygon
              </Button>
              <div className="w-px h-6 bg-white/10" />
              <Button 
                variant="ghost"
                className={cn(
                  "font-black h-11 px-6 rounded-xl text-[10px] uppercase tracking-widest transition-all active:scale-95",
                  window.google && drawingMode === window.google.maps.drawing.OverlayType.CIRCLE 
                    ? "bg-primary text-white" 
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
                onClick={() => {
                  if (!window.google) return;
                  setDrawingMode(
                      drawingMode === window.google.maps.drawing.OverlayType.CIRCLE 
                          ? null 
                          : window.google.maps.drawing.OverlayType.CIRCLE
                  );
                  setSelectedZoneId(null);
                }}
              >
                <Plus className="w-4 h-4 mr-2" /> Draw Circle
              </Button>
          </div>
          {drawingMode !== null && (
            <DrawingManager
              onPolygonComplete={onPolygonComplete}
              onCircleComplete={onCircleComplete}
              options={{
                drawingMode: drawingMode,
                drawingControl: false,
                polygonOptions: {
                  fillColor: "#ef4444",
                  fillOpacity: 0.15,
                  strokeColor: "#ef4444",
                  strokeWeight: 2,
                  clickable: false,
                  zIndex: 99
                },
                circleOptions: {
                  fillColor: "#ef4444",
                  fillOpacity: 0.15,
                  strokeColor: "#ef4444",
                  strokeWeight: 2,
                  clickable: false,
                  zIndex: 99
                }
              }}
            />
          )}

          {zones.map((zone) => (
            zone.type === 'circle' ? (
              <Circle
                key={zone.id}
                center={zone.center}
                radius={zone.radius}
                onClick={() => setSelectedZoneId(zone.id)}
                options={{
                  fillColor: zone.color,
                  fillOpacity: 0.2,
                  strokeColor: zone.color,
                  strokeWeight: 2,
                  clickable: true,
                  editable: selectedZoneId === zone.id,
                  draggable: selectedZoneId === zone.id,
                  zIndex: selectedZoneId === zone.id ? 2 : 1
                }}
                onCenterChanged={function(this: google.maps.Circle) {
                  const center = this.getCenter();
                  handleCircleEdit(zone.id, center, this.getRadius());
                }}
                onRadiusChanged={function(this: google.maps.Circle) {
                  const center = this.getCenter();
                  handleCircleEdit(zone.id, center, this.getRadius());
                }}
              />
            ) : (
              <Polygon
                key={zone.id}
                path={zone.paths}
                onLoad={(polygon) => handlePolygonLoad(polygon, zone.id)}
                onUnmount={() => {
                  delete polygonRefs.current[zone.id];
                }}
                onClick={() => setSelectedZoneId(zone.id)}
                options={{
                  fillColor: zone.color,
                  fillOpacity: 0.2,
                  strokeColor: zone.color,
                  strokeWeight: 2,
                  clickable: true,
                  editable: selectedZoneId === zone.id,
                  draggable: selectedZoneId === zone.id,
                  zIndex: selectedZoneId === zone.id ? 2 : 1
                }}
                onMouseUp={() => handlePolygonEdit(zone.id)}
                onDragEnd={() => handlePolygonEdit(zone.id)}
              />
            )
          ))}
        </GoogleMap>

        <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-3">
          <Button
            size="icon"
            className="w-14 h-14 rounded-full bg-white shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:bg-gray-50 text-black border border-gray-100 pointer-events-auto transition-all active:scale-90"
            onClick={() => setIsSidebarVisible(!isSidebarVisible)}
            title={isSidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
          >
            <MapIcon className="w-6 h-6" />
          </Button>
          <Button
            size="icon"
            className="w-14 h-14 rounded-full bg-white shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:bg-gray-50 text-black border border-gray-100 pointer-events-auto transition-all active:scale-90"
            onClick={() => {
              if (isExpanded) {
                setIsSidebarVisible(true);
              }
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? <Minimize2 className="w-6 h-6 font-bold" /> : <Maximize2 className="w-6 h-6 font-bold" />}
          </Button>
        </div>

      </div>
    </div>
  );

  if (isExpanded) {
    return createPortal(EditorLayout, document.body);
  }

  return EditorLayout;
}
