import { Router, Request, Response } from 'express';
import { musicBrainz } from '../lib/search';
import { isAuthenticated } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import dataSource from '../datasource';
import { MusicAlbum } from '../entity/MusicAlbum';
import { param } from '../utils/params';

const router = Router();

// GET /music/:id - Get album details by MusicBrainz release group ID
router.get('/:id', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const id = param(req.params.id);

  const album = await musicBrainz.getReleaseGroup(id);
  if (!album) {
    return res.status(404).json({ error: 'Album not found' });
  }

  // Check if we have this album in our database
  const albumRepo = dataSource.getRepository(MusicAlbum);
  const localAlbum = await albumRepo.findOne({
    where: { musicBrainzId: id },
    relations: ['requests'],
  });

  return res.json({ ...album, media: localAlbum || undefined });
}));

// GET /music/:id/tracks - Get album tracks
router.get('/:id/tracks', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
  const id = param(req.params.id);

  const tracks = await musicBrainz.getTracks(id);
  return res.json({ results: tracks });
}));

export default router;
