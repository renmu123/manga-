import express from "express";
import "express-async-errors";

import validator from "express-validator";
import validate from "../utils/valid.js";
import prisma from "../utils/db.js";

const { body, param } = validator;
const router = express.Router();

router.post("/add", validate([body("name").isString()]), async (req, res) => {
  const data = {
    name: req.body.name,
  };
  const post = await prisma.author.create({
    data: data,
  });
  res.json(post);
});

router.post(
  "/addMany",
  validate([body("names").isArray()]),
  async (req, res) => {
    let data = Array.from(new Set(req.body.names));
    data = data
      .filter((name) => {
        if (name) {
          return true;
        }
      })
      .map((name) => {
        return { name: name };
      });

    const inserts = [];
    for (const item of data) {
      inserts.push(prisma.author.create({ data: item }));
    }
    const posts = await prisma.$transaction(inserts);
    res.json(posts);
  }
);

router.post(
  "/remove",
  validate([body("id").isInt().toInt()]),
  async (req, res) => {
    const { id } = req.body;
    const post = await prisma.author.delete({
      where: { id },
    });
    res.json(post);
  }
);

router.post(
  "/edit",
  validate([body("id").isInt().toInt()]),
  async (req, res) => {
    const data = {
      name: req.body.name,
    };
    const post = await prisma.author.update({
      where: { id: req.body.id },
      data: data,
    });
    res.json(post);
  }
);

router.get(
  "/query/:id",
  validate([param("id").isInt().toInt()]),
  async (req, res) => {
    const post = await prisma.author.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        comics: true,
      },
    });
    res.json(post);
  }
);

router.get("/list", async (req, res) => {
  const post = await prisma.author.findMany({});
  res.json(post);
});

export default router;
