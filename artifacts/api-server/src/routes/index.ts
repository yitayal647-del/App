import { Router, type IRouter } from "express";
import healthRouter from "./health";
import yallRouter from "./yall";

const router: IRouter = Router();

router.use(healthRouter);
router.use(yallRouter);

export default router;
