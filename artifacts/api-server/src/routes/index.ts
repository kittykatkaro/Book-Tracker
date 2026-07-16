import { Router, type IRouter } from "express";
import healthRouter from "./health";
import booksRouter from "./books";
import clubsRouter from "./clubs";
import importRouter from "./import";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/books/import", importRouter);  // must be before /books
router.use("/books", booksRouter);
router.use("/clubs", clubsRouter);

export default router;
