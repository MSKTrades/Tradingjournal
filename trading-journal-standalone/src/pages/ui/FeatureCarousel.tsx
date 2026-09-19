// A lively, auto-advancing carousel for a feature detail page's hero visual
// slot (FeatureDetail.tsx) — replaces what used to be a single static
// screenshot or a single interactive widget with 2-4 "slides" that cycle
// on their own, the same way TradeZella's feature pages keep a screenshot
// area in motion instead of static. Each slide is either a real product
// screenshot (see public/screenshots/) or one of featureVisuals.tsx's
// small interactive widgets — mixing both in one feature's slide list is
// intentional: a real screenshot proves the feature exists and looks like
// this in the actual app, and a live widget right after it proves it's not
// just a picture, you can actually click/drag the real behavior.
//
// Deliberately built with plain CSS transitions rather than a carousel
// library - this is a 2-4 item, autoplay-with-dots component, not
// something that needs virtualization or swipe-gesture libraries, and
// keeping it dependency-free keeps every feature page's bundle weight down.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type FeatureSlide =
  | { kind: 'image'; src: string; alt: string; caption: string }
  | { kind: 'component'; render: () => ReactNode; caption: string };

const AUTOPLAY_MS = 5200;

export function FeatureCarousel({ slides }: { slides: FeatureSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (slides.length <= 1 || paused || reducedMotion.current) return;
    timerRef.current = setInterval(() => {
      setIndex(i => (i + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slides.length, paused]);

  if (slides.length === 0) return null;

  function go(i: number) {
    setIndex(((i % slides.length) + slides.length) % slides.length);
  }

  const single = slides.length === 1;

  return (
    <div
      className="relative rounded-xl border border-border bg-card overflow-hidden group"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="region"
      aria-label="Feature preview"
    >
      <div className="relative aspect-[16/10] sm:aspect-[16/9] bg-muted/30">
        {slides.map((slide, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-all duration-500 ease-out"
            style={{
              opacity: i === index ? 1 : 0,
              transform: i === index ? 'translateX(0)' : i < index ? 'translateX(-2%)' : 'translateX(2%)',
              pointerEvents: i === index ? 'auto' : 'none',
            }}
            aria-hidden={i !== index}
          >
            {slide.kind === 'image' ? (
              // object-contain (not cover) deliberately - these slides mix
              // full-page 16:10-ish screenshots with much narrower/taller
              // cropped close-ups (a single card, a chart), and a crop
              // aggressive enough to fill the frame on one of those shapes
              // reliably cuts off the actual data the slide exists to show
              // (e.g. a ledger's dollar figures below the fold). Letterboxed
              // but always intact beats filled but truncated here.
              <img
                src={slide.src}
                alt={slide.alt}
                className="w-full h-full object-contain object-center"
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center p-4 sm:p-8 overflow-auto">
                <div className="w-full max-w-md">{slide.render()}</div>
              </div>
            )}
          </div>
        ))}

        {!single && (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => go(index - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => go(index + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-background/80 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-border bg-card">
        <p className="text-xs sm:text-[13px] text-muted-foreground min-w-0 truncate">{slides[index].caption}</p>
        {!single && (
          <div className="flex items-center gap-1.5 shrink-0">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-primary' : 'w-1.5 bg-border hover:bg-muted-foreground/50'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
