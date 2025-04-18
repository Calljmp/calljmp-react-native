import { Attestation } from './attestation';
import { Store } from './store';
import { Users } from './users';
import { Config } from './config';
import { Project } from './project';
import { Database } from './database';
import { Service } from './service';
import { Integrity } from './integrity';

export class Calljmp {
  private _project: Project;
  private _attestation: Attestation;
  private _store: Store;
  private _users: Users;
  private _database: Database;
  private _service: Service;
  private _integrity: Integrity;

  constructor(config: Partial<Config> = {}) {
    const baseUrl =
      (config.development?.enabled ? config.development?.baseUrl : null) ??
      'https://api.calljmp.com';

    const finalConfig: Config = {
      serviceUrl: `${baseUrl}/target/v1`,
      projectUrl: `${baseUrl}/project`,
      ...config,
    };

    this._store = new Store();
    this._attestation = new Attestation(config);
    this._integrity = new Integrity(finalConfig, this._attestation);
    this._users = new Users(finalConfig, this._attestation, this._store);
    this._project = new Project(finalConfig, this._attestation);
    this._database = new Database(finalConfig, this._store);
    this._service = new Service(finalConfig, this._integrity, this._store);
  }

  get service() {
    return this._service;
  }

  get users() {
    return this._users;
  }

  get project() {
    return this._project;
  }

  get database() {
    return this._database;
  }
}
