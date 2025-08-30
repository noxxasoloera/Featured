const express = require('express');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const multer = require('multer');
const JsConfuser = require('js-confuser');
const AdmZip = require('adm-zip');
const cheerio = require('cheerio');
const { tmpdir } = require('os');

const router = express.Router();
const upload = multer({ dest: path.join(tmpdir(), 'uploads/') });

// ===== GET HTML =====
router.post('/gethtml', async (req, res) => {
  const { url } = req.body;
  if(!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error:'URL invalid' });
  try {
    const response = await axios.get(url, { maxRedirects:5 });
    const filename = `source-${Date.now()}.html`;
    const filePath = path.join(tmpdir(), filename);
    await fs.writeFile(filePath, response.data, 'utf-8');
    res.download(filePath, filename, async ()=> await fs.unlink(filePath));
  } catch(err){ res.status(500).json({error:'Gagal mengambil HTML', detail:err.message}) }
});

// ===== ENCRYPT JS =====
router.post('/encryptjs', upload.single('jsfile'), async (req, res)=>{
  if(!req.file || !req.file.originalname.endsWith('.js')) return res.status(400).json({error:'File JS wajib diupload!'});
  const inputPath = req.file.path;
  const outputPath = path.join(tmpdir(), `encrypted-${req.file.originalname}`);
  try{
    const fileContent = await fs.readFile(inputPath, 'utf-8');
    const obfuscated = await JsConfuser.obfuscate(fileContent, {
      target: 'node',
      compact: true,
      renameVariables: true,
      stringEncoding: true,
      stringSplitting: true
    });
    await fs.writeFile(outputPath, obfuscated.code || obfuscated);
    res.download(outputPath, `encrypted-${req.file.originalname}`, async ()=>{
      await fs.unlink(inputPath); await fs.unlink(outputPath);
    });
  } catch(err){ res.status(500).json({error:'Gagal encrypt JS', detail:err.message}) }
});

// ===== ZIP WEBSITE =====
router.post('/getsitezip', async (req,res)=>{
  const { url } = req.body;
  if(!url || !/^https?:\/\//i.test(url)) return res.status(400).json({error:'URL invalid'});
  try{
    const resHtml = await axios.get(url);
    const $ = cheerio.load(resHtml.data);
    const baseFolder = path.join(tmpdir(), `site_${Date.now()}`);
    const assetsFolder = path.join(baseFolder,'assets');
    await fs.ensureDir(assetsFolder);

    const tags = [
      { tag:'link[rel="stylesheet"]', attr:'href', folder:'css' },
      { tag:'script[src]', attr:'src', folder:'js' },
      { tag:'img[src]', attr:'src', folder:'img' }
    ];
    for(const {tag,attr,folder} of tags){
      const elems = $(tag);
      for(let i=0;i<elems.length;i++){
        const el = elems[i];
        const link = $(el).attr(attr);
        if(!link || link.startsWith('data:')) continue;
        try{
          const fileUrl = new URL(link,url).href;
          const fileName = path.basename(fileUrl.split('?')[0]);
          const folderPath = path.join(assetsFolder,folder);
          await fs.ensureDir(folderPath);
          const fileRes = await axios.get(fileUrl,{responseType:'arraybuffer'});
          await fs.writeFile(path.join(folderPath,fileName),fileRes.data);
          $(el).attr(attr,`assets/${folder}/${fileName}`);
        }catch{}
      }
    }
    await fs.writeFile(path.join(baseFolder,'index.html'),$.html());
    const zip = new AdmZip();
    zip.addLocalFolder(baseFolder);
    const zipPath = path.join(tmpdir(),`website_${Date.now()}.zip`);
    zip.writeZip(zipPath);
    res.download(zipPath,'website_code.zip', async ()=>{ await fs.remove(baseFolder); await fs.unlink(zipPath) });
  } catch(err){ res.status(500).json({error:'Gagal zip website', detail:err.message}) }
});

module.exports = router;