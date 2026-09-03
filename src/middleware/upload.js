const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../data/temp/'));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.sol')) {
        cb(null, true);
    } else {
        cb(new Error('Only .sol files are allowed'), false);
    }
};

const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: fileFilter 
});

module.exports = upload;
