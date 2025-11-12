const signatoryService = require('./signatory.service');

const list = async (req, res, next) => {
  try {
    const signatories = await signatoryService.listUniqueSignatories(req.user);
    res.status(200).json(signatories);
  } catch (error) {
    next(error);
  }
};

module.exports = { list };