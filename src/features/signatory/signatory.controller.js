const signatoryService = require('./signatory.service');

const list = async (req, res, next) => {
  try {
    const signatories = await signatoryService.listUniqueSignatories(req.user);
    res.status(200).json(signatories);
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const newSignatory = await signatoryService.createSignatoryContact(req.user, req.body);
    res.status(201).json(newSignatory);
  } catch (error) {
    next(error);
  }
};

module.exports = { list, create };