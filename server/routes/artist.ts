import { Router, Request, Response } from 'express';
import { musicBrainz } from '../lib/search';
import { isAuthenticated } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { param, safeInt } from '../utils/params';
import { enrichWithMedia } from '../lib/enrichMedia';

const router = Router();

// GET /artist/:id
router.get('/:id', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const id = param(req.params.id);

  const artist = await musicBrainz.getArtist(id);
  if (!artist) {
    return res.status(404).json({ error: 'Artist not found' });
  }

  return res.json(artist);
}));

// GET /artist/:id/albums
router.get('/:id/albums', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const id = param(req.params.id);
  const limit = Math.min(safeInt(req.query.limit as string, 25), 100);

  const albums = await musicBrainz.getArtistAlbums(id, limit);
  const enriched = await enrichWithMedia(albums, 'music');
  return res.json({ results: enriched });
}));

export default router;
