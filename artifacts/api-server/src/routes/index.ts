import { Router, type IRouter } from "express";
import healthRouter from "./health";
import messagingRouter from "./messaging";
import socialRouter from "./social";
import yallRouter from "./yall";

const router: IRouter = Router();

router.use(healthRouter);
router.use(yallRouter);
router.use(socialRouter);
router.use(messagingRouter);

export default router;
