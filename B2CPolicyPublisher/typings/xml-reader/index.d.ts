import { EventEmitter } from "eventemitter3";

declare module "xml-reader" {
  declare interface XmlNode {
    name: string;
    type: NodeType;
    value: string;
    parent: XmlNode;
    attributes: {
      [name: string]: string;
    };
    children: XmlNode[];
  }

  declare interface CreateOptions {
    stream?: boolean;
    parentNodes?: boolean;
    doneEvent?: string;
    tagPrefix?: string;
    emitTopLevelOnly?: boolean;
    debug?: boolean;
  }

  export function create(options?: CreateOptions): EventEmitter;

  declare interface ParseOptions {
    stream?: boolean;
    tagPrefix?: string;
  }

  export function parseSync(xml: string, options?: ParseOptions): XmlNode;

  export enum NodeType {
    element = "element",
    text = "text",
  }
}
