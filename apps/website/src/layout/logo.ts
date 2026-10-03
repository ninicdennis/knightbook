/**
 * The approved Knightbook mark, as the desktop app's icon derivation leaves it.
 *
 * The canonical `docs/assets/knightbook-logo.png` has wide transparent margins:
 * its artwork fills about half of the square, so at 32 pixels the visible mark
 * would be about 20. `apps/desktop/scripts/derive-icon.cjs` crops that same
 * artwork to its alpha bounds, unchanged otherwise, into `build/icon.png`, where
 * it fills 96% of the height. Using that file sizes the visible mark as intended
 * without redrawing, recolouring or tracing anything, and without a second
 * derivation to keep in step.
 */
import logo from '../../../desktop/build/icon.png'

export default logo
