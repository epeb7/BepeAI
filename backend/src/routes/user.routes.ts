import { Router } from 'express';
import { getProfile, uploadLogo, removeLogo, updateSettings } from '../controllers/user.controller';

const router = Router();

router.get('/profile',   getProfile);
router.put('/logo',      uploadLogo);
router.delete('/logo',   removeLogo);
router.put('/settings',  updateSettings);

export default router;
