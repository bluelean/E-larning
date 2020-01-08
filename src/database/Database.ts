import SQLite from "react-native-sqlite-storage";
import { DatabaseInitialization } from "./DatabaseInitialization";
import { Clinic } from "../types/Clinic";
import { User, NewUser } from "../types/User";
import { StringContent } from "../types/StringContent";
import { uuid } from 'uuidv4';
import { SyncResponse } from "../types/syncResponse";
import { Patient, NewPatient } from "../types/Patient";
import { LanguageString } from "../types/LanguageString";
// import * as bcrypt from 'bcrypt';

export interface Database {
  open(): Promise<SQLite.SQLiteDatabase>;
  close(): Promise<void>;
  login(email: string, password: string): Promise<any>;
  getClinics(): Promise<Clinic[]>;
  getPatients(): Promise<Patient[]>;
  addUser(user: NewUser, password: string): Promise<void>;
  languageStringDataById(id: string): Promise<LanguageString>;
  saveStringContent(stringContent: StringContent[], id?: string): Promise<string>;
  applyScript(script: SyncResponse): Promise<void>;
  addPatient(patient: NewPatient): Promise<void>;
}

class DatabaseImpl implements Database {
  private databaseName = "AppDatabase.db";
  private database: SQLite.SQLiteDatabase | undefined;

  // Open the connection to the database
  public open(): Promise<SQLite.SQLiteDatabase> {
    SQLite.DEBUG(true);
    SQLite.enablePromise(true);
    let databaseInstance: SQLite.SQLiteDatabase;

    return SQLite.openDatabase({
      name: this.databaseName,
      location: "default"
    })
      .then(db => {
        databaseInstance = db;
        console.log("[db] Database open!");

        // Perform any database initialization or updates, if needed
        const databaseInitialization = new DatabaseInitialization();
        return databaseInitialization.updateDatabaseTables(databaseInstance);
      })
      .then(() => {
        this.database = databaseInstance;
        return databaseInstance;
      });
  }

  // Close the connection to the database
  public close(): Promise<void> {
    if (this.database === undefined) {
      return Promise.reject("[db] Database was not open; unable to close.");
    }
    return this.database.close().then(status => {
      console.log("[db] Database closed.");
      this.database = undefined;
    });
  }

  public async saveStringContent(stringContent: StringContent[], id?: string): Promise<string> {
    const contentId = id || uuid();
    var stringId = contentId.replace(/-/g, "");
    const db = await this.getDatabase();
    await db.executeSql(`INSERT INTO string_ids (id) VALUES (?);`, [stringId]);
    stringContent.forEach(async element => {
      await this.saveStringWithId(element, stringId);
    })
    return stringId;
  }
  
  private async saveStringWithId(stringContent: StringContent, id: string): Promise<string> {
    const date = new Date().toISOString();
    const db = await this.getDatabase();
    await db.executeSql(`INSERT INTO string_content (id, language, content, edited_at) VALUES (?, ?, ?, ?);`, [id, stringContent.language, stringContent.content, date]);
    return id;
  }

  public async addUser(user: NewUser, password: string): Promise<void> {
    const date = new Date().toISOString();

    // const hashed_password = bcrypt.hash(password, 10, function (err, hash) {
    //   return hash
    // });
    const hashed_password = password
    const db = await this.getDatabase();
      
    await db.executeSql(`INSERT INTO users (id, name, role, email, hashed_password, edited_at) VALUES (?, ?, ?, ?, ?, ?);`, [user.id, user.name, user.role, user.email, hashed_password, date]);
    return;
  }

  public addPatient(patient: NewPatient): Promise<void> {
    const date = new Date().toISOString();
    const id = patient.id.replace(/-/g, "")
    return this.getDatabase()
      .then(db =>
        db.executeSql(`INSERT INTO patients (id, given_name, surname, date_of_birth, country, hometown, phone, sex, edited_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`, [id, patient.given_name, patient.surname, patient.date_of_birth, patient.country, patient.hometown, patient.phone, patient.sex, date])
      )
      .then(([results]) => {
        console.log(
          `[db] Added patient with id: "${id}"!`
        );
      });
  }

  // gets clinics from database
  public getClinics(): Promise<Clinic[]> {
    console.log("[db] Fetching clinics from the db...");
    return this.getDatabase()
      .then(db =>
        db.executeSql("SELECT * FROM clinics ORDER BY id DESC;")
      )
      .then(([results]) => {
        if (results === undefined) {
          return [];
        }
        const count = results.rows.length;
        const clinics: Clinic[] = [];
        for (let i = 0; i < count; i++) {
          const row = results.rows.item(i);
          const { name, id } = row;
          console.log(`[db] Clinic name: ${name}, id: ${id}`);
          clinics.push({ id, name });
        }
        return clinics;
      });
  }

  public getPatients(): Promise<Patient[]> {
    console.log("[db] Fetching patients from the db...");
    return this.getDatabase()
      .then(db =>
        db.executeSql("SELECT id, given_name, surname, date_of_birth, country, hometown, sex, phone FROM patients;")
      )
      .then(async ([results]) => {
        if (results === undefined) {
          return [];
        }
        const count = results.rows.length;
        const patients: Patient[] = [];
        for (let i = 0; i < count; i++) {

          const row = results.rows.item(i);
          const { id, given_name, surname, date_of_birth, country, hometown, sex, phone } = row;
          const givenNameContent =  await this.languageStringDataById(given_name)
          const surnameContent = await this.languageStringDataById(surname)
          const countryContent = await this.languageStringDataById(country)
          const hometownContent = await this.languageStringDataById(hometown)
          console.log(`[db] Patient name: ${given_name}, id: ${id}`);
          patients.push({ id, given_name: givenNameContent, surname: surnameContent, date_of_birth, country: countryContent, hometown: hometownContent, sex, phone });
        }
        return patients;
      });
  }

  public login(email: string, password: string): Promise<any> {
    return this.getDatabase()
      .then(db =>
        db.executeSql(
          `SELECT * FROM users WHERE email = ?;`,
          [email]
        )
      )
      .then(([results]) => {
        if (results === undefined) {
          return null;
        }
        const count = results.rows.length;
        for (let i = 0; i < count; i++) {
          const row = results.rows.item(i);
          // let match = bcrypt.compare(password, row.hashed_password, res => {
          //   return res;
          // });

          let match = (row.hashed_password === password)
          if (match) {
            return row;
          }
        }
      });
  }

  //TODO: find by selected language
  public async languageStringDataById(id: string): Promise<LanguageString> {
    return this.getDatabase()
      .then(db =>
        db.executeSql(
          `SELECT language as language_string, content as content_string FROM string_content WHERE id = ?;`,
          [id]
        )
      )
      .then(([results]) => {
        if (results === undefined) {
          return null;
        }
        const count = results.rows.length;
        const content = {}

        for (let i = 0; i < count; i++) {
          const row = results.rows.item(i);
          const { language_string, content_string } = row;
          content[language_string] = content_string;
        }
        if (count > 0) {
          return {id, content}
        }
        return null
      });
  }

  public applyScript(syncResponse: SyncResponse): Promise<void> {

    return this.getDatabase().then(db => {
      db.transaction((transaction: SQLite.Transaction) => {
        syncResponse.values.forEach(value => {
          transaction.executeSql(syncResponse.sql, value)
        })
      })
    }).then(() => {
        console.log(
          `[db] Updates applied!`
        );
      });

  }

  private getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (this.database !== undefined) {
      return Promise.resolve(this.database);
    }
    // otherwise: open the database first
    return this.open();
  }
}

// Export a single instance of DatabaseImpl
export const database: Database = new DatabaseImpl();