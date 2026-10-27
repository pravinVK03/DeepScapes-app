"use client";
/* eslint-disable @next/next/no-img-element */

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";

type CropShape = "circle" | "cover";
type ImageSize = { width: number; height: number };
type LoadedImage = { source: string; size: ImageSize; element: HTMLImageElement };

function readImage(file: File) {
  return new Promise<LoadedImage>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.onload = () => {
      const source = String(reader.result);
      const image = new window.Image();
      image.onerror = () => reject(new Error("The image could not be prepared."));
      image.onload = () => resolve({ source, size: { width: image.naturalWidth, height: image.naturalHeight }, element: image });
      image.src = source;
    };
    reader.readAsDataURL(file);
  });
}

export function ImageCropDialog({ file, shape, close, save }: { file: File; shape: CropShape; close: () => void; save: (image: string) => void }) {
  const viewport = shape === "circle" ? { width: 360, height: 360 } : { width: 480, height: 270 };
  // These are display images, not source assets. Keeping the generated files
  // small prevents every dashboard request from carrying oversized base64 data.
  const output = shape === "circle" ? { width: 192, height: 192 } : { width: 640, height: 360 };
  const [image, setImage] = useState<LoadedImage>();
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; position: { x: number; y: number } } | undefined>(undefined);
  const closeRef = useRef(close);

  useEffect(() => { closeRef.current = close; }, [close]);

  useEffect(() => {
    let cancelled = false;
    void readImage(file).then((next) => { if (!cancelled) setImage(next); }).catch(() => { if (!cancelled) closeRef.current(); });
    return () => { cancelled = true; };
  }, [file]);
  const scale = useMemo(() => image ? Math.max(viewport.width / image.size.width, viewport.height / image.size.height) * zoom : 1, [image, viewport.height, viewport.width, zoom]);
  const limits = image ? { x: Math.max(0, (image.size.width * scale - viewport.width) / 2), y: Math.max(0, (image.size.height * scale - viewport.height) / 2) } : { x: 0, y: 0 };
  const imageStyle = image ? { width: image.size.width * scale, height: image.size.height * scale, left: viewport.width / 2 + position.x, top: viewport.height / 2 + position.y } : undefined;
  const name = shape === "circle" ? "profile picture" : "thumbnail";

  function begin(event: PointerEvent<HTMLDivElement>) {
    start.current = { x: event.clientX, y: event.clientY, position };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const x = start.current.position.x + event.clientX - start.current.x;
    const y = start.current.position.y + event.clientY - start.current.y;
    setPosition({ x: Math.max(-limits.x, Math.min(limits.x, x)), y: Math.max(-limits.y, Math.min(limits.y, y)) });
  }
  function end() { start.current = undefined; setDragging(false); }
  function render() {
    if (!image) return;
    const canvas = document.createElement("canvas"); canvas.width = output.width; canvas.height = output.height;
    const context = canvas.getContext("2d"); if (!context) return;
    const outputScale = Math.max(output.width / image.size.width, output.height / image.size.height) * zoom;
    context.drawImage(image.element, output.width / 2 + (position.x / viewport.width) * output.width - (image.size.width * outputScale) / 2, output.height / 2 + (position.y / viewport.height) * output.height - (image.size.height * outputScale) / 2, image.size.width * outputScale, image.size.height * outputScale);
    save(canvas.toDataURL(shape === "circle" ? "image/jpeg" : "image/webp", .74));
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={close}><section onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#dce1d9] bg-[#f9faf7] shadow-2xl"><header className="flex items-center justify-between border-b border-[#e5e8e2] px-5 py-4"><div><p className="text-xs font-medium uppercase tracking-[.14em] text-[#718077]">Image editor</p><h2 className="mt-1 text-lg font-semibold">Crop your new {name}</h2></div><button type="button" onClick={close} className="grid h-9 w-9 place-items-center rounded-lg text-[#718077] hover:bg-[#edf0df]" aria-label="Close crop editor">×</button></header><div className="bg-[#101010] p-5"><div onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className={"relative mx-auto overflow-hidden bg-[#242424] " + (shape === "circle" ? "max-w-[22.5rem] rounded-full" : "max-w-[30rem] rounded-lg")} style={{ aspectRatio: `${viewport.width} / ${viewport.height}`, touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}>{image ? <img src={image.source} alt="Crop preview" draggable={false} className="pointer-events-none absolute max-w-none -translate-x-1/2 -translate-y-1/2 select-none" style={imageStyle} /> : <div className="grid h-full place-items-center text-sm text-white/60">Preparing image…</div>}<span className={"pointer-events-none absolute inset-0 border-2 border-dashed border-white/80 " + (shape === "circle" ? "rounded-full" : "rounded-lg")} /></div><p className="mt-3 text-center text-xs text-white/65">Drag the image to reposition it.</p></div><div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto]"><label className="grid grid-cols-[3.5rem_1fr] items-center gap-3 text-sm text-[#718077]">Zoom<input type="range" min="1" max="2.5" step="0.02" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }} className="rounded-lg border px-3 py-2 text-sm hover:bg-[#edf0df]">Reset</button><button type="button" onClick={close} className="rounded-lg px-3 py-2 text-sm text-[#718077] hover:bg-[#edf0df]">Cancel</button><button type="button" onClick={render} disabled={!image} className="rounded-lg bg-[#315443] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Set {name}</button></div></div></section></div>;
}
