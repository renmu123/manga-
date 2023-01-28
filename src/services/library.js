import prisma from "../utils/db.js";

import fs, { readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { keyBy, uniqBy, merge } from "lodash-es";

import comicSerice from "./comic.js";
import chapterService from "./chapter.js";
import { filterImgFile, isImgFile, idArchiveFile } from "../utils/index.js";
import comic from "./comic.js";

const getLibrary = async (id) => {
  const post = await prisma.library.findUnique({
    where: {
      id: id,
    },
    include: {
      comics: true,
      config: true,
    },
  });
  return post;
};

const getLibrarys = async (data, queryConfig = false) => {
  const posts = await prisma.library.findMany({
    where: data,
    include: {
      config: queryConfig,
    },
  });
  return posts;
};

const editLibrary = async (id, data) => {
  const post = await prisma.library.update({
    where: { id },
    data: data,
  });
  return post;
};

const addLibrary = async (data) => {
  const defaultConfig = {
    coverCopy: false,
    fileHash: true,
    scanRootArchiveFile: false,
  };
  data = merge({ config: defaultConfig }, data);

  if (data.config) {
    data["config"] = {
      create: data.config,
    };
  }

  const post = await prisma.library.create({
    data: data,
  });
  return post;
};

const scanLibrary = async (libraryId) => {
  const library = await getLibrary(libraryId);
  if (!library) {
    throw new Error("libraryId不合法");
  }

  const dir = library.dir;
  let files = await fs.readdir(dir);
  const data2 = {};

  // 扫描文件夹
  for (const file of files) {
    // 第一层文件夹
    const comicName = file;
    const filePath = path.join(dir, file);
    const fileStat = await fs.stat(filePath);
    if (fileStat.isDirectory()) {
      let files = await fs.readdir(filePath);
      // 忽略文件夹
      if (
        files.some((file) => {
          return file === ".ignore";
        })
      ) {
        continue;
      }

      let hasDefault = false;
      for (const file of files) {
        // 第二层文件夹
        const filePath2 = path.join(filePath, file);

        const fileStat = await fs.stat(filePath2);

        if (fileStat.isFile()) {
          if (idArchiveFile(file)) {
            data2[comicName] = data2[comicName] || [];
            data2[comicName].push({ name: file, dir: filePath2, type: "file" });
          }
          // 如果在漫画根文件夹下有图片文件，生成一个虚拟章节，名称为 default
          if (isImgFile(file)) {
            hasDefault = true;
          }
        } else if (fileStat.isDirectory) {
          let files = await fs.readdir(filePath2);
          if (
            files.some((file) => {
              return file === ".ignore";
            })
          ) {
            continue;
          }
          data2[comicName] = data2[comicName] || [];
          data2[comicName].push({ name: file, dir: filePath2 });
        }
      }
      if (hasDefault) {
        data2[comicName] = data2[comicName] || [];
        data2[comicName].push({ name: "default", dir: filePath });
      }
    }
  }

  // 移除不存在的comic以及chapter
  const comics = await comic.getComics(libraryId, true);
  for (const comicData of comics) {
    if (existsSync(comicData.dir)) {
      for (const chapterData of comicData.chapters) {
        if (!existsSync(chapterData.dir)) {
          await chapterService.removeChapter(chapterData.id);
        }
      }
    } else {
      await comic.removeComic(comicData.id);
    }
  }
  console.log(data2);

  // 添加comic&chapter
  for (const [name, chapters] of Object.entries(data2)) {
    // 添加comic
    let post = await prisma.comic.findFirst({
      where: {
        libraryId: libraryId,
        dir: path.join(dir, name),
      },
    });
    if (!post) {
      post = await comic.addComic({
        name: name,
        libraryId: libraryId,
        dir: path.join(dir, name),
      });
    }
    // 添加chapter
    for (const chapter of chapters) {
      let post2 = await prisma.chapter.findFirst({
        where: {
          comicId: post.id,
          dir: chapter.dir,
        },
      });
      if (!post2) {
        await chapterService.addChapter({
          name: chapter.name,
          comicId: post.id,
          dir: chapter.dir,
          type: chapter.type,
        });
      }
    }
  }

  // 扫描封面
  scanCover();
};

// scan cover
const scanCover = async (libraryId) => {
  const comics = await comicSerice.getComics(libraryId);

  const chapterData = [];
  for (const comic of comics) {
    const chapters = await chapterService.getChapters(comic.id);
    for (const chapter of chapters) {
      // if (chapter.cover) continue;
      if (chapter.type === "folder") {
        const names = await readdir(chapter.dir);
        const cover = filterImgFile(names)[0];
        if (cover) {
          chapterData.push({
            id: chapter.id,
            cover: path.join(chapter.dir, cover),
            comicId: comic.id,
          });
        }
      } else if (chapter.type === "file") {
      }
    }
  }

  // update chapter cover
  for (const chapter of chapterData) {
    await chapterService.updateChapter(chapter.id, chapter);
  }

  // update comic cover which has not cover,use the chapter cover default.
  for (const comic of uniqBy(chapterData, "comicId")) {
    if (!keyBy(comics, "id")[comic.comicId].cover) {
      await comicSerice.updateComic(comic.comicId, { cover: comic.cover });
    }
  }
};

export default {
  getLibrary,
  getLibrarys,
  editLibrary,
  addLibrary,
  scanLibrary,
  scanCover,
};
