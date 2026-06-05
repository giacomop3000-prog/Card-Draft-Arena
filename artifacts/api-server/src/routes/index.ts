import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import cardsRouter from "./cards";
import draftsRouter from "./drafts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(cardsRouter);
router.use(draftsRouter);

export default router;
