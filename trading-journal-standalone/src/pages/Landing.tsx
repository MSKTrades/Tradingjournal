import { Link } from 'react-router-dom';
import { BarChart2, Check, X, Clock3, ArrowRight } from 'lucide-react';
import { Button } from '../lib/ui/button';
import { Badge } from '../lib/ui/form';
import { MarketingHeader, MarketingFooter } from './ui/MarketingChrome';
import { BLOG_POSTS } from './data/blogPosts';
import { FEATURES } from './data/features';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import RuleToggleDemo from './ui/RuleToggleDemo';
import ProBadge from '../components/ProBadge';
import ComingSoonBadge from '../components/ComingSoonBadge';
import { featureSlug } from '../lib/featureSlug';

// Decorative ascending-bar heights behind the hero headline — hand-picked
// (not random) so the pattern is stable across renders and reads as a
// gently noisy uptrend rather than a perfectly straight staircase.
const HERO_BARS = [
  34, 48, 40, 60, 50, 72, 58, 88, 68, 100, 82, 116, 96, 132, 108, 150,
  126, 168, 140, 188, 158, 206, 176, 226, 196, 244, 214, 262, 234, 280,
];

/** Purely decorative candlestick/trend-line pattern behind the hero copy —
 * low-opacity, faded at the edges via a mask so it never competes with the
 * headline text sitting on top of it. */
function HeroBackground() {
  const barWidth = 14;
  const gap = 8;
  const baseline = 320;
  const points = HERO_BARS.map((h, i) => {
    const x = i * (barWidth + gap);
    return { x: x + barWidth / 2, y: baseline - h, barX: x, barH: h };
  });
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div
      className="absolute inset-x-0 top-0 h-[420px] overflow-hidden pointer-events-none select-none"
      style={{
        WebkitMaskImage: 'radial-gradient(ellipse 75% 100% at 50% 20%, black 40%, transparent 85%)',
        maskImage: 'radial-gradient(ellipse 75% 100% at 50% 20%, black 40%, transparent 85%)',
      }}
      aria-hidden="true"
    >
      <div className="absolute left-1/2 top-10 w-[560px] h-[560px] -translate-x-1/2 rounded-full bg-primary/25 blur-[110px]" />
      <svg
        className="absolute left-1/2 top-24 -translate-x-1/2 opacity-[0.16] dark:opacity-[0.22]"
        width={points[points.length - 1].x + barWidth}
        height={baseline}
        viewBox={`0 0 ${points[points.length - 1].x + barWidth} ${baseline}`}
        fill="none"
      >
        <defs>
          <linearGradient id="heroBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf5c" />
            <stop offset="100%" stopColor="#e8790f" />
          </linearGradient>
          <linearGradient id="heroLineGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#e8790f" />
            <stop offset="100%" stopColor="#fbbf5c" />
          </linearGradient>
        </defs>
        {points.map((p, i) => (
          <rect key={i} x={p.barX} y={p.y} width={barWidth} height={p.barH} rx={2.5} fill="url(#heroBarGrad)" />
        ))}
        <path d={linePath} stroke="url(#heroLineGrad)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Two intertwined ribbon strands (a bright main strand + a dimmer twin),
// each built as a variable-width filled shape — not a fixed-width stroked
// line — so they taper to a point at both ends the way a piece of silk
// catches light unevenly along its length. Coordinates are pre-computed
// (Catmull-Rom centerline + a sine-bump width envelope) rather than
// hand-drawn, so the taper and curvature stay smooth; see the design note
// below SectionWave for how to regenerate these if the shape ever needs
// to change.
const RIBBON_MAIN =
  'M -40.0,300.0 L -34.0,302.2 L -27.0,305.0 L -18.9,308.4 L -10.0,312.2 L -0.1,316.5 L 10.4,320.9 L 21.6,325.5 L 33.4,330.1 L 45.6,334.7 L 58.2,339.0 L 71.1,343.0 L 84.2,346.6 L 97.4,349.7 L 110.7,352.1 L 123.9,353.7 L 137.1,354.3 L 150.0,353.9 L 162.8,352.3 L 175.5,349.0 L 187.9,344.1 L 199.8,338.0 L 211.5,330.7 L 222.9,322.7 L 234.0,314.0 L 245.0,304.9 L 255.9,295.5 L 266.8,286.1 L 277.6,276.8 L 288.4,267.8 L 299.2,259.4 L 310.0,251.6 L 320.8,244.7 L 331.5,238.8 L 342.2,234.2 L 352.7,230.8 L 363.2,228.7 L 373.9,228.1 L 385.3,228.7 L 397.5,230.6 L 410.4,233.6 L 423.9,237.5 L 437.8,242.3 L 452.2,247.6 L 467.0,253.3 L 482.0,259.3 L 497.3,265.2 L 512.8,271.0 L 528.5,276.4 L 544.3,281.1 L 560.4,284.9 L 576.6,287.7 L 593.0,288.9 L 609.6,288.4 L 626.1,285.7 L 642.1,280.6 L 657.1,273.7 L 671.2,265.2 L 684.5,255.5 L 697.1,244.8 L 709.1,233.5 L 720.6,221.7 L 731.7,209.6 L 742.4,197.5 L 752.8,185.4 L 763.0,173.7 L 772.9,162.5 L 782.5,152.1 L 792.0,142.6 L 801.1,134.3 L 809.9,127.3 L 818.2,121.9 L 826.3,117.9 L 834.2,115.3 L 842.1,113.7 L 849.8,113.1 L 857.7,113.4 L 865.8,114.5 L 874.2,116.4 L 882.8,118.8 L 891.7,121.9 L 901.0,125.2 L 910.5,128.8 L 920.4,132.5 L 930.7,135.9 L 941.4,139.1 L 952.5,141.6 L 964.2,143.5 L 976.3,144.4 L 988.8,144.1 L 1001.6,142.5 L 1014.9,139.7 L 1028.9,136.0 L 1043.5,131.5 L 1058.8,126.2 L 1074.5,120.4 L 1090.5,114.0 L 1106.6,107.3 L 1122.8,100.3 L 1138.8,93.2 L 1154.5,86.0 L 1169.7,78.9 L 1184.3,71.9 L 1198.2,65.2 L 1211.0,59.0 L 1222.8,53.2 L 1233.4,48.0 L 1242.5,43.6 L 1250.0,40.0 L 1250.0,40.0 L 1241.9,42.3 L 1232.3,45.4 L 1221.2,49.2 L 1208.8,53.5 L 1195.3,58.4 L 1180.9,63.6 L 1165.7,69.1 L 1149.9,74.8 L 1133.7,80.6 L 1117.3,86.2 L 1100.8,91.8 L 1084.4,97.1 L 1068.2,102.0 L 1052.5,106.5 L 1037.5,110.4 L 1023.3,113.6 L 1010.1,116.0 L 998.4,117.5 L 987.8,118.0 L 977.8,117.4 L 968.2,116.0 L 958.8,113.9 L 949.6,111.1 L 940.4,107.8 L 931.3,104.1 L 922.1,100.1 L 912.8,96.0 L 903.3,91.9 L 893.6,88.0 L 883.6,84.4 L 873.2,81.3 L 862.3,79.0 L 850.8,77.7 L 838.9,77.6 L 826.5,79.0 L 813.7,82.1 L 800.7,87.1 L 788.1,93.8 L 776.0,101.9 L 764.2,111.0 L 752.6,121.0 L 741.2,131.5 L 729.9,142.6 L 718.7,153.8 L 707.6,165.0 L 696.5,176.1 L 685.5,186.8 L 674.6,196.9 L 663.8,206.1 L 653.2,214.4 L 642.9,221.4 L 632.8,227.1 L 623.2,231.4 L 613.9,234.3 L 604.3,235.9 L 593.8,236.4 L 582.3,235.8 L 569.9,234.2 L 556.6,231.5 L 542.7,228.1 L 528.2,224.0 L 513.3,219.4 L 498.0,214.5 L 482.5,209.5 L 466.8,204.6 L 451.1,200.0 L 435.2,195.9 L 419.4,192.5 L 403.6,190.1 L 387.8,188.9 L 372.2,189.2 L 356.8,191.3 L 342.1,195.3 L 328.1,200.8 L 314.9,207.6 L 302.3,215.4 L 290.2,224.0 L 278.6,233.2 L 267.3,242.8 L 256.4,252.7 L 245.7,262.6 L 235.2,272.5 L 225.0,282.1 L 214.9,291.2 L 204.9,299.7 L 195.1,307.4 L 185.4,314.2 L 175.9,319.9 L 166.6,324.5 L 157.2,327.7 L 147.2,329.9 L 136.3,331.2 L 124.8,331.7 L 112.8,331.5 L 100.4,330.5 L 87.7,328.9 L 74.9,326.9 L 62.1,324.4 L 49.4,321.6 L 37.0,318.6 L 24.9,315.5 L 13.3,312.4 L 2.3,309.4 L -8.0,306.7 L -17.6,304.3 L -26.1,302.3 L -33.7,300.8 L -40.0,300.0 Z';
const RIBBON_MAIN_GLOW =
  'M -40.0,300.0 L -34.2,303.0 L -27.5,306.6 L -19.7,310.7 L -11.0,315.4 L -1.5,320.4 L 8.8,325.6 L 19.8,331.0 L 31.4,336.4 L 43.5,341.8 L 56.1,347.0 L 69.0,351.8 L 82.3,356.3 L 95.8,360.1 L 109.5,363.4 L 123.4,365.7 L 137.5,367.1 L 151.6,367.3 L 166.1,366.1 L 180.6,362.9 L 194.7,358.0 L 208.2,351.7 L 221.1,344.4 L 233.5,336.3 L 245.5,327.7 L 257.2,318.7 L 268.6,309.6 L 279.8,300.6 L 290.8,291.8 L 301.6,283.5 L 312.2,275.8 L 322.5,269.0 L 332.5,263.2 L 342.0,258.6 L 351.0,255.2 L 359.4,253.0 L 367.2,252.1 L 375.0,252.2 L 383.8,253.3 L 393.8,255.4 L 405.0,258.4 L 417.1,262.4 L 430.0,267.3 L 443.7,272.7 L 458.0,278.7 L 472.8,284.9 L 488.2,291.2 L 504.1,297.4 L 520.5,303.2 L 537.5,308.5 L 555.1,312.9 L 573.4,316.0 L 592.6,317.6 L 612.5,317.0 L 632.8,313.6 L 652.4,307.4 L 670.4,299.1 L 686.7,289.1 L 701.7,278.1 L 715.5,266.3 L 728.3,254.0 L 740.3,241.3 L 751.6,228.6 L 762.3,216.0 L 772.6,203.7 L 782.3,191.9 L 791.6,180.8 L 800.4,170.7 L 808.7,161.7 L 816.4,154.1 L 823.3,148.0 L 829.1,143.4 L 834.2,140.3 L 839.1,138.0 L 844.0,136.4 L 849.2,135.4 L 854.9,135.1 L 861.2,135.4 L 868.3,136.4 L 876.1,138.1 L 884.6,140.5 L 893.7,143.3 L 903.4,146.4 L 913.8,149.6 L 924.8,152.8 L 936.5,155.6 L 948.9,157.9 L 961.8,159.4 L 975.4,159.8 L 989.4,158.9 L 1003.5,156.6 L 1017.5,152.9 L 1031.9,148.4 L 1046.8,143.1 L 1062.2,137.0 L 1077.9,130.4 L 1093.8,123.3 L 1109.8,115.8 L 1125.8,108.0 L 1141.5,100.1 L 1157.0,92.1 L 1171.9,84.2 L 1186.2,76.5 L 1199.8,69.0 L 1212.3,62.0 L 1223.8,55.5 L 1234.0,49.6 L 1242.8,44.4 L 1250.0,40.0 L 1250.0,40.0 L 1241.6,41.5 L 1231.7,43.9 L 1220.2,46.9 L 1207.5,50.5 L 1193.7,54.6 L 1178.9,59.1 L 1163.5,63.8 L 1147.4,68.7 L 1131.0,73.7 L 1114.3,78.6 L 1097.6,83.3 L 1081.0,87.8 L 1064.8,92.0 L 1049.1,95.6 L 1034.2,98.7 L 1020.2,101.1 L 1007.5,102.7 L 996.5,103.4 L 987.2,103.1 L 978.7,102.0 L 970.5,100.1 L 962.5,97.6 L 954.4,94.5 L 946.3,90.9 L 937.9,86.9 L 929.2,82.6 L 920.1,78.0 L 910.5,73.3 L 900.4,68.7 L 889.5,64.3 L 877.8,60.4 L 865.1,57.3 L 851.5,55.4 L 836.9,54.9 L 821.7,56.3 L 805.8,59.7 L 789.8,65.5 L 774.7,73.2 L 760.6,82.1 L 747.4,91.9 L 734.7,102.4 L 722.5,113.2 L 710.6,124.3 L 699.0,135.5 L 687.7,146.5 L 676.6,157.1 L 665.9,167.2 L 655.4,176.4 L 645.5,184.7 L 636.0,191.7 L 627.3,197.5 L 619.5,201.7 L 612.9,204.6 L 607.2,206.4 L 601.4,207.4 L 594.3,207.8 L 585.4,207.4 L 575.1,206.2 L 563.4,204.1 L 550.6,201.2 L 536.8,197.6 L 522.3,193.4 L 507.2,188.8 L 491.5,184.1 L 475.4,179.4 L 458.9,175.0 L 442.0,171.0 L 424.8,167.7 L 407.3,165.3 L 389.4,164.3 L 371.1,165.1 L 352.8,167.9 L 335.4,173.0 L 319.2,179.8 L 304.4,187.9 L 290.6,196.9 L 277.7,206.6 L 265.6,216.8 L 254.1,227.2 L 243.2,237.7 L 232.7,248.2 L 222.6,258.4 L 212.8,268.2 L 203.4,277.5 L 194.3,286.1 L 185.5,293.7 L 177.1,300.4 L 169.1,306.0 L 161.5,310.5 L 153.9,313.9 L 145.5,316.5 L 135.9,318.5 L 125.3,319.7 L 113.9,320.2 L 102.0,320.0 L 89.6,319.3 L 77.0,318.1 L 64.2,316.4 L 51.5,314.5 L 39.0,312.3 L 26.7,310.0 L 14.9,307.7 L 3.6,305.5 L -7.0,303.6 L -16.8,301.9 L -25.6,300.7 L -33.4,300.0 L -40.0,300.0 Z';
const RIBBON_MAIN_CENTERLINE =
  'M -40.0,300.0 L -33.8,301.5 L -26.6,303.6 L -18.2,306.3 L -9.0,309.5 L 1.1,313.0 L 11.9,316.7 L 23.3,320.5 L 35.2,324.4 L 47.5,328.1 L 60.1,331.7 L 73.0,334.9 L 85.9,337.8 L 98.9,340.1 L 111.7,341.8 L 124.4,342.7 L 136.7,342.8 L 148.6,341.9 L 160.0,340.0 L 171.0,336.7 L 181.9,332.0 L 192.6,326.1 L 203.3,319.1 L 213.9,311.2 L 224.4,302.6 L 235.0,293.5 L 245.6,284.0 L 256.3,274.4 L 267.0,264.8 L 277.9,255.3 L 288.9,246.3 L 300.1,237.8 L 311.5,230.1 L 323.2,223.2 L 335.1,217.5 L 347.4,213.0 L 360.0,210.0 L 373.0,208.6 L 386.6,208.8 L 400.6,210.3 L 414.9,213.0 L 429.5,216.7 L 444.4,221.1 L 459.5,226.1 L 474.7,231.4 L 490.0,236.9 L 505.3,242.3 L 520.5,247.5 L 535.6,252.2 L 550.5,256.3 L 565.1,259.5 L 579.4,261.7 L 593.4,262.7 L 607.0,262.2 L 620.0,260.0 L 632.6,256.0 L 645.0,250.4 L 657.0,243.3 L 668.9,234.9 L 680.5,225.5 L 691.9,215.2 L 703.1,204.2 L 714.1,192.9 L 725.0,181.3 L 735.8,169.6 L 746.4,158.1 L 757.0,147.0 L 767.6,136.5 L 778.1,126.8 L 788.5,118.1 L 799.0,110.6 L 809.5,104.5 L 820.0,100.0 L 830.4,97.1 L 840.5,95.7 L 850.3,95.4 L 860.0,96.2 L 869.5,97.9 L 878.9,100.4 L 888.2,103.4 L 897.5,106.9 L 906.9,110.6 L 916.3,114.5 L 925.8,118.3 L 935.6,121.9 L 945.5,125.1 L 955.7,127.8 L 966.2,129.7 L 977.0,130.9 L 988.3,131.0 L 1000.0,130.0 L 1012.5,127.8 L 1026.1,124.8 L 1040.5,120.9 L 1055.7,116.3 L 1071.3,111.2 L 1087.4,105.6 L 1103.7,99.6 L 1120.0,93.3 L 1136.3,86.9 L 1152.2,80.4 L 1167.7,74.0 L 1182.6,67.8 L 1196.7,61.8 L 1209.9,56.3 L 1222.0,51.2 L 1232.8,46.7 L 1242.2,42.9 L 1250.0,40.0';
const RIBBON_SUB =
  'M -40.0,360.0 L -31.7,357.1 L -21.9,353.3 L -10.6,348.5 L 2.0,343.1 L 15.6,337.0 L 30.2,330.6 L 45.6,323.8 L 61.7,316.8 L 78.2,309.9 L 95.0,303.0 L 111.9,296.4 L 128.9,290.1 L 145.6,284.4 L 162.0,279.4 L 177.9,275.1 L 193.1,271.7 L 207.3,269.4 L 220.5,268.3 L 232.7,268.6 L 244.7,270.3 L 256.6,273.2 L 268.4,277.3 L 280.3,282.2 L 292.1,287.9 L 303.9,294.1 L 315.8,300.7 L 327.6,307.5 L 339.6,314.3 L 351.6,320.8 L 363.8,326.9 L 376.1,332.4 L 388.7,337.0 L 401.6,340.5 L 414.9,342.7 L 428.5,343.1 L 442.4,341.6 L 456.3,338.0 L 470.0,332.4 L 483.4,325.3 L 496.6,316.8 L 509.7,307.2 L 522.5,296.8 L 535.3,285.8 L 547.9,274.3 L 560.5,262.7 L 572.9,251.1 L 585.2,239.8 L 597.4,228.9 L 609.3,218.8 L 621.1,209.6 L 632.5,201.6 L 643.6,194.9 L 654.3,189.7 L 664.5,186.2 L 674.6,184.1 L 684.9,183.2 L 695.6,183.4 L 706.6,184.6 L 717.9,186.7 L 729.6,189.6 L 741.5,193.1 L 753.7,197.1 L 766.0,201.3 L 778.5,205.7 L 791.1,210.0 L 803.9,214.1 L 816.7,217.7 L 829.7,220.6 L 842.7,222.6 L 855.8,223.6 L 869.0,223.2 L 882.1,221.3 L 894.9,217.8 L 907.4,212.9 L 919.6,207.0 L 931.6,200.2 L 943.4,192.6 L 955.0,184.5 L 966.5,175.9 L 977.8,167.1 L 989.0,158.1 L 1000.0,149.2 L 1010.9,140.4 L 1021.7,132.1 L 1032.3,124.2 L 1042.6,117.0 L 1052.8,110.6 L 1062.8,105.1 L 1072.4,100.7 L 1081.9,97.5 L 1091.5,95.4 L 1101.6,94.0 L 1112.0,93.4 L 1122.6,93.5 L 1133.4,94.3 L 1144.2,95.5 L 1155.1,97.2 L 1165.8,99.2 L 1176.4,101.6 L 1186.7,104.1 L 1196.6,106.7 L 1206.2,109.3 L 1215.2,111.8 L 1223.7,114.2 L 1231.4,116.3 L 1238.5,118.0 L 1244.7,119.3 L 1250.0,120.0 L 1250.0,120.0 L 1244.9,118.4 L 1239.0,116.3 L 1232.3,113.7 L 1224.8,110.8 L 1216.7,107.5 L 1207.9,104.0 L 1198.6,100.5 L 1188.8,96.9 L 1178.6,93.4 L 1168.1,90.2 L 1157.2,87.1 L 1146.1,84.5 L 1134.9,82.3 L 1123.5,80.8 L 1112.1,79.9 L 1100.7,79.8 L 1089.4,80.6 L 1078.1,82.5 L 1066.9,85.7 L 1055.7,90.2 L 1044.5,95.8 L 1033.3,102.3 L 1022.1,109.7 L 1010.9,117.6 L 999.7,125.9 L 988.5,134.5 L 977.2,143.2 L 966.0,151.8 L 954.7,160.1 L 943.5,168.1 L 932.3,175.5 L 921.1,182.2 L 910.0,188.0 L 899.1,192.8 L 888.4,196.4 L 877.9,198.7 L 867.5,199.7 L 857.0,199.4 L 846.3,197.9 L 835.2,195.5 L 824.0,192.2 L 812.4,188.1 L 800.7,183.6 L 788.7,178.7 L 776.5,173.7 L 764.1,168.6 L 751.5,163.7 L 738.6,159.3 L 725.4,155.4 L 712.0,152.4 L 698.2,150.5 L 684.2,149.9 L 669.9,150.9 L 655.5,153.8 L 641.3,158.8 L 627.5,165.6 L 614.1,173.9 L 601.1,183.4 L 588.4,193.9 L 576.0,205.1 L 563.7,216.9 L 551.5,228.9 L 539.5,241.1 L 527.6,253.1 L 515.8,264.7 L 504.1,275.8 L 492.6,286.1 L 481.1,295.4 L 469.9,303.4 L 458.9,310.0 L 448.1,315.1 L 437.6,318.4 L 427.2,320.0 L 416.7,320.1 L 406.0,318.8 L 395.0,316.2 L 383.9,312.5 L 372.5,307.9 L 361.0,302.4 L 349.3,296.4 L 337.4,290.0 L 325.3,283.4 L 313.0,276.9 L 300.5,270.6 L 287.8,264.9 L 274.7,259.8 L 261.4,255.7 L 247.7,252.9 L 233.7,251.4 L 219.5,251.7 L 205.0,253.5 L 189.8,256.7 L 174.1,260.9 L 157.8,266.1 L 141.3,272.1 L 124.5,278.7 L 107.6,285.9 L 90.9,293.5 L 74.3,301.4 L 58.2,309.3 L 42.5,317.2 L 27.5,325.0 L 13.4,332.4 L 0.2,339.4 L -11.9,345.8 L -22.7,351.4 L -32.1,356.2 L -40.0,360.0 Z';
const RIBBON_SUB_GLOW =
  'M -40.0,360.0 L -31.5,357.7 L -21.4,354.4 L -9.8,350.2 L 3.0,345.3 L 17.0,339.8 L 31.8,333.9 L 47.5,327.7 L 63.7,321.3 L 80.4,314.9 L 97.4,308.6 L 114.5,302.6 L 131.5,296.9 L 148.2,291.8 L 164.5,287.3 L 180.2,283.6 L 195.0,280.8 L 208.8,279.1 L 221.0,278.5 L 232.1,279.2 L 242.8,281.2 L 253.6,284.3 L 264.4,288.3 L 275.4,293.3 L 286.6,299.1 L 297.9,305.4 L 309.4,312.2 L 321.1,319.2 L 333.1,326.3 L 345.3,333.3 L 357.8,339.9 L 370.9,346.0 L 384.4,351.3 L 398.7,355.4 L 413.7,358.1 L 429.4,358.9 L 445.7,357.4 L 461.9,353.4 L 477.5,347.4 L 492.4,339.7 L 506.8,330.8 L 520.7,320.9 L 534.3,310.3 L 547.7,299.1 L 560.7,287.7 L 573.5,276.2 L 586.1,264.8 L 598.4,253.8 L 610.3,243.4 L 621.9,233.8 L 633.0,225.3 L 643.5,218.1 L 653.2,212.3 L 662.0,208.1 L 669.8,205.4 L 677.4,203.8 L 685.4,203.0 L 694.0,203.0 L 703.4,203.9 L 713.4,205.6 L 724.1,208.0 L 735.4,211.1 L 747.2,214.6 L 759.5,218.6 L 772.1,222.7 L 785.0,226.8 L 798.4,230.7 L 812.0,234.2 L 826.0,237.0 L 840.4,239.0 L 855.0,239.8 L 870.0,239.0 L 885.0,236.5 L 899.4,232.3 L 913.1,226.7 L 926.2,220.0 L 938.8,212.5 L 951.0,204.3 L 962.9,195.6 L 974.5,186.6 L 985.8,177.4 L 996.9,168.1 L 1007.7,158.9 L 1018.3,150.0 L 1028.7,141.5 L 1038.8,133.5 L 1048.6,126.3 L 1058.1,119.9 L 1067.2,114.4 L 1075.8,110.0 L 1084.2,106.7 L 1092.8,104.3 L 1102.1,102.6 L 1111.9,101.6 L 1122.0,101.2 L 1132.5,101.3 L 1143.1,102.0 L 1153.8,103.1 L 1164.5,104.6 L 1175.0,106.4 L 1185.4,108.3 L 1195.4,110.4 L 1205.1,112.4 L 1214.3,114.4 L 1223.0,116.3 L 1230.9,117.8 L 1238.2,119.0 L 1244.6,119.8 L 1250.0,120.0 L 1250.0,120.0 L 1245.0,117.9 L 1239.3,115.3 L 1232.8,112.2 L 1225.5,108.7 L 1217.5,104.9 L 1209.0,100.9 L 1199.8,96.8 L 1190.1,92.7 L 1180.0,88.6 L 1169.4,84.8 L 1158.5,81.2 L 1147.3,78.0 L 1135.8,75.3 L 1124.1,73.2 L 1112.2,71.8 L 1100.2,71.2 L 1088.1,71.7 L 1075.8,73.3 L 1063.5,76.4 L 1051.2,80.9 L 1039.2,86.5 L 1027.3,93.0 L 1015.5,100.3 L 1003.9,108.1 L 992.3,116.3 L 980.8,124.7 L 969.4,133.2 L 958.0,141.5 L 946.8,149.5 L 935.6,157.0 L 924.7,163.9 L 913.9,169.9 L 903.5,175.0 L 893.4,179.0 L 883.9,181.9 L 875.0,183.5 L 866.5,183.9 L 857.8,183.2 L 848.6,181.6 L 838.9,179.0 L 828.7,175.6 L 817.9,171.5 L 806.7,166.8 L 795.1,161.8 L 783.0,156.4 L 770.5,151.0 L 757.5,145.8 L 744.0,140.9 L 729.9,136.6 L 715.2,133.1 L 699.8,130.9 L 683.7,130.1 L 667.1,131.2 L 650.2,134.6 L 633.6,140.4 L 617.9,148.2 L 603.2,157.4 L 589.2,167.8 L 575.9,178.9 L 563.0,190.7 L 550.5,202.9 L 538.4,215.2 L 526.5,227.6 L 514.8,239.7 L 503.5,251.3 L 492.3,262.3 L 481.5,272.4 L 471.0,281.3 L 460.9,288.9 L 451.4,295.1 L 442.6,299.6 L 434.3,302.6 L 426.3,304.3 L 417.9,304.7 L 408.9,303.9 L 399.3,302.0 L 389.2,299.0 L 378.5,294.9 L 367.3,290.0 L 355.8,284.3 L 343.9,278.3 L 331.6,271.9 L 319.0,265.6 L 306.0,259.4 L 292.6,253.7 L 278.7,248.8 L 264.4,244.7 L 249.6,242.0 L 234.4,240.8 L 219.0,241.5 L 203.6,243.9 L 187.9,247.6 L 171.8,252.4 L 155.3,258.1 L 138.7,264.7 L 121.9,272.0 L 105.1,279.7 L 88.5,287.9 L 72.1,296.3 L 56.1,304.8 L 40.7,313.3 L 25.9,321.6 L 12.0,329.6 L -0.9,337.1 L -12.7,344.1 L -23.3,350.3 L -32.4,355.6 L -40.0,360.0 Z';

/** Purely decorative — a glowing orange silk-ribbon wave, modeled on a
 * light-painting photo reference: a bright tapering main strand plus a
 * dimmer twin strand crossing beneath it, each with its own soft blurred
 * glow layer and a thin bright highlight thread along the main strand's
 * spine. Sits behind the "Watch a rule change the numbers" section to
 * break up what was previously a long stretch of flat dark background,
 * without ever sitting in front of the demo widget or headline text
 * (z-index 0, everything else in the section is implicitly above it). */
function SectionWave() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.55] dark:opacity-[0.42]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
        <defs>
          <linearGradient id="landingRibbonMain" x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0%" stopColor="#7c2d12" stopOpacity="0" />
            <stop offset="14%" stopColor="#c2410c" stopOpacity="0.85" />
            <stop offset="48%" stopColor="#f97316" stopOpacity="1" />
            <stop offset="63%" stopColor="#fed7aa" stopOpacity="1" />
            <stop offset="82%" stopColor="#ea580c" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7c2d12" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="landingRibbonSub" x1="0" y1="0" x2="1" y2="0.2">
            <stop offset="0%" stopColor="#7c2d12" stopOpacity="0" />
            <stop offset="22%" stopColor="#9a3412" stopOpacity="0.7" />
            <stop offset="52%" stopColor="#ea580c" stopOpacity="0.8" />
            <stop offset="78%" stopColor="#fb923c" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#7c2d12" stopOpacity="0" />
          </linearGradient>
          <filter id="landingRibbonBlurLg" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="20" />
          </filter>
          <filter id="landingRibbonBlurMd" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <filter id="landingRibbonBlurSm" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1" />
          </filter>
        </defs>
        <path d={RIBBON_MAIN_GLOW} fill="url(#landingRibbonMain)" filter="url(#landingRibbonBlurLg)" opacity={0.5} />
        <path d={RIBBON_SUB_GLOW} fill="url(#landingRibbonSub)" filter="url(#landingRibbonBlurLg)" opacity={0.35} />
        <path d={RIBBON_SUB} fill="url(#landingRibbonSub)" filter="url(#landingRibbonBlurMd)" opacity={0.7} />
        <path d={RIBBON_MAIN} fill="url(#landingRibbonMain)" filter="url(#landingRibbonBlurMd)" opacity={0.92} />
        <path
          d={RIBBON_MAIN_CENTERLINE}
          fill="none"
          stroke="#ffedd5"
          strokeWidth={1.2}
          filter="url(#landingRibbonBlurSm)"
          opacity={0.45}
        />
      </svg>
    </div>
  );
}

type ComparisonValue = boolean | 'manual';
const COMPARISON: { label: string; spreadsheet: ComparisonValue; notes: ComparisonValue; pipecho: ComparisonValue }[] = [
  { label: 'Automatic equity curve & running balance', spreadsheet: false, notes: false, pipecho: true },
  { label: 'Win rate, profit factor, R-multiple breakdowns', spreadsheet: 'manual', notes: false, pipecho: true },
  { label: 'Bar-by-bar backtesting on real historical data', spreadsheet: false, notes: false, pipecho: true },
  { label: 'Pre-trade checklist enforcement', spreadsheet: false, notes: false, pipecho: true },
  { label: 'Live risk-limit warnings', spreadsheet: false, notes: false, pipecho: true },
  { label: 'Custom fields for your exact strategy', spreadsheet: 'manual', notes: true, pipecho: true },
];

function ComparisonCell({ value }: { value: boolean | 'manual' }) {
  if (value === true) return <Check className="w-4 h-4 text-primary mx-auto" />;
  if (value === 'manual') return <span className="text-xs text-muted-foreground">Manual</span>;
  return <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />;
}

const SCREENSHOTS = [
  { src: '/screenshots/summary.png', alt: 'PipEcho Summary dashboard showing trading sessions, strategy stats, and daily quote', title: 'Summary', desc: 'Your trading day at a glance — sessions, strategy performance, and market news in one dashboard.' },
  { src: '/screenshots/journal.png', alt: 'PipEcho Trade Journal table showing 150 logged trades with P/L, RR, and running capital', title: 'Trade Journal', desc: 'Every trade logged with full context, filterable by asset, side, outcome, tag, and date range.' },
  { src: '/screenshots/performance.png', alt: 'PipEcho Performance page showing profit factor, drawdown chart, and win/loss breakdown', title: 'Performance', desc: 'Expectancy, profit factor, drawdown, and winners/losers breakdown — computed automatically.' },
  { src: '/screenshots/strategies.png', alt: 'PipEcho Strategies page showing two defined strategy playbooks with filter rules', title: 'Strategy Playbooks', desc: 'Define a setup once — filters, TP rules, applicable accounts — and track it forever after.' },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Landing() {
  useDocumentMeta({
    title: 'PipEcho — Trading Journal, Backtesting & Session Analytics for Traders',
    description: 'A trading journal, backtesting and session-analytics workspace built for every trader — forex, crypto, futures, and stocks — with Strategy Playbooks, Risk Guardrail, and pre-trade checklists included free.',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'PipEcho',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      description: 'A trading journal, backtesting and session-analytics workspace built for every trader, across forex, crypto, futures, and stocks.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      url: 'https://pipecho.com/',
    },
  });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <section className="relative px-6 pt-20 pb-16 text-center overflow-hidden">
        <HeroBackground />
        <div className="relative max-w-6xl mx-auto">
          <span className="inline-block text-xs font-semibold tracking-wide uppercase text-primary bg-accent px-3 py-1 rounded-full mb-6">
            Built for every trader — forex to crypto
          </span>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">
            Trade with data, not guesswork.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mt-5">
            PipEcho is a trading journal and backtesting workspace — log every trade,
            replay historical price action, and see exactly which setups are actually
            making you money.
          </p>
          <div className="flex items-center justify-center gap-3 mt-8">
            <Link to="/signup">
              <Button size="default" className="h-11 px-6 text-base">Get started free</Button>
            </Link>
            <Link to="/demo">
              <Button variant="outline" size="default" className="h-11 px-6 text-base">Try the live demo</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="relative px-6 pb-20 overflow-hidden">
        <SectionWave />
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">Watch a rule change the numbers</h2>
            <p className="text-muted-foreground mt-2">
              A real sample journal, filtering itself — this is the same journal you'd try in the live demo.
            </p>
          </div>
          <RuleToggleDemo autoplay compact />
          <div className="text-center mt-6">
            <Link to="/demo" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Try it yourself, no signup needed <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold tracking-tight">See it before you sign up</h2>
            <p className="text-muted-foreground mt-2">Real screens from the actual app — not mockups.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {SCREENSHOTS.map(s => (
              <div key={s.title} className="rounded-xl border border-border bg-card overflow-hidden">
                <img src={s.src} alt={s.alt} className="w-full h-auto border-b border-border" loading="lazy" />
                <div className="p-5">
                  <h3 className="font-semibold mb-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold tracking-tight">Everything your trading log should do</h2>
            <p className="text-muted-foreground mt-2">One workspace for journaling, backtesting, and performance review.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc, pro, comingSoon }) => (
              <Link
                key={title}
                to={`/features/${featureSlug(title)}`}
                className="group rounded-lg border border-border bg-card p-6 hover:border-primary/50 hover:shadow-sm transition-all"
              >
                <div className="w-10 h-10 rounded-md bg-accent flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <h3 className="font-semibold">{title}</h3>
                  {comingSoon && <ComingSoonBadge />}
                  {pro && <ProBadge feature={pro} />}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  Learn more <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/50">
        <div className="max-w-4xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold tracking-tight">Why not just use a spreadsheet?</h2>
            <p className="text-muted-foreground mt-2">Plenty of traders start there. Here's where it stops being enough.</p>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-muted-foreground py-3 px-5">Feature</th>
                  <th className="font-medium text-muted-foreground py-3 px-3 w-28">Spreadsheet</th>
                  <th className="font-medium text-muted-foreground py-3 px-3 w-28">Notes app</th>
                  <th className="font-semibold text-primary py-3 px-3 w-28">PipEcho</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(row => (
                  <tr key={row.label} className="border-b border-border last:border-b-0">
                    <td className="py-3.5 px-5 text-foreground/90">{row.label}</td>
                    <td className="text-center px-3"><ComparisonCell value={row.spreadsheet} /></td>
                    <td className="text-center px-3"><ComparisonCell value={row.notes} /></td>
                    <td className="text-center px-3"><ComparisonCell value={row.pipecho} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">From the blog</h2>
              <p className="text-muted-foreground mt-2">Strategy, risk, and the process behind trading with data.</p>
            </div>
            <Link to="/blog" className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              View all posts <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {BLOG_POSTS.slice(-3).reverse().map(post => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="rounded-lg border border-border bg-card p-6 hover:border-primary/50 transition-colors flex flex-col"
              >
                <Badge variant="outline" className="w-fit mb-3">{post.tag}</Badge>
                <h3 className="font-semibold leading-snug mb-2">{post.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1 line-clamp-3">{post.excerpt}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-5 pt-4 border-t border-border">
                  <span>{fmtDate(post.date)}</span>
                  <span className="flex items-center gap-1"><Clock3 className="w-3 h-3" />{post.readTime}</span>
                </div>
              </Link>
            ))}
          </div>
          <Link to="/blog" className="sm:hidden flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline mt-8">
            View all posts <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="rounded-2xl bg-sidebar text-sidebar-foreground px-8 py-14 text-center">
          <BarChart2 className="w-8 h-8 text-sidebar-active mx-auto mb-4" />
          <h2 className="text-2xl font-semibold tracking-tight">Start journaling in under a minute</h2>
          <p className="text-sidebar-muted mt-2 max-w-xl mx-auto">
            No credit card, no setup wizard. Create an account and start logging trades right away.
          </p>
          <Link to="/signup" className="inline-block mt-6">
            <Button size="default" className="h-11 px-6 text-base">Create your free account</Button>
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
