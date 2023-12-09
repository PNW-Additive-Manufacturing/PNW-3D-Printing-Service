
import db from '@/app/api/Database';
import { Navbar } from '@/app/components/Navigation';
import { PrinterList, Printer } from './PrinterList';

/*
CREATE TABLE Printer (
  Name varchar(120) NOT NULL PRIMARY KEY, -- Bob, Joe, Cnacer
  Model varchar(120) NOT NULL,
  Dimensions int[3] NOT NULL DEFAULT '{}',
  SupportedMaterials varchar(10)[] NOT NULL,
  OutOfOrder bool NOT NULL DEFAULT false,
  CommunicationStrategy varchar,
  CommunicationStrategyOptions varchar,
  Queue SMALLINT[] NOT NULL DEFAULT '{}'
);
*/


export default async function Page() {
  let printers: Printer[] = (await db`select * from printer`).map((p) => {
    return {
      name: p.name,
      model: p.model,
      dimensions: p.dimensions,
      communicationstrategy: p.communicationstrategy
    };
  });
  return (
    <main>
      <Navbar links={[
        {name: "Add Printer", path: "/dashboard/admin/printers/addprinter"}
      ]}/>

      <PrinterList initialPrinters={printers}/>
    </main>
  );
}