import { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../lib/ui/card';

/** The "nothing here yet" version of a Summary-page card — used instead of
 * a component quietly returning null when it has no data to show yet.
 *
 * A card that vanishes when it's empty leaves a hole in whatever grid it
 * sits in (its sibling doesn't reflow to fill the gap), which is exactly
 * what made the space next to HTF Bias Alignment look broken for an
 * account that had HTF Bias data but no Execution Mistakes tagged yet. It
 * also means a brand-new account's dashboard looks incomplete/buggy on day
 * one instead of just "not filled in yet". This renders the same Card
 * shell every other Summary card uses, with a short explanation of what
 * will show up here once there's something to show — so the layout never
 * has a silent gap, for a new account or an existing one. */
export default function EmptyBlock({ icon: Icon, title, message }: { icon: LucideIcon; title: string; message: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-base font-bold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
