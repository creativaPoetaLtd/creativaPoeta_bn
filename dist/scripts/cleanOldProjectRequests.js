"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const ProjectDescription_1 = __importDefault(require("../models/ProjectDescription"));
// Load environment variables
dotenv_1.default.config();
// Connect to MongoDB
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield mongoose_1.default.connect(process.env.MONGO_URI || "mongodb://localhost:27017/creativapoeta");
        console.log("Connected to MongoDB");
    }
    catch (error) {
        console.error("Error connecting to MongoDB:", error);
        process.exit(1);
    }
});
const cleanOldProjectRequests = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield connectDB();
        // Find all project requests
        const allRequests = yield ProjectDescription_1.default.find({});
        console.log(`Found ${allRequests.length} total project requests`);
        // Identify old requests (those without serviceType and selectedServices)
        const oldRequests = allRequests.filter((request) => !request.serviceType ||
            !request.selectedServices ||
            Array.isArray(request.selectedServices) === false ||
            request.selectedServices.length === 0);
        console.log(`Found ${oldRequests.length} old project requests with outdated structure`);
        if (oldRequests.length > 0) {
            console.log("\nOld requests to be deleted:");
            oldRequests.forEach((request, index) => {
                console.log(`${index + 1}. ID: ${request._id}`);
                console.log(`   Name: ${request.name}`);
                console.log(`   Email: ${request.email}`);
                console.log(`   Created: ${request.createdAt}`);
                console.log(`   Has serviceType: ${!!request.serviceType}`);
                console.log(`   Has selectedServices: ${!!request.selectedServices}`);
                console.log(`   ---`);
            });
            // Delete old requests
            const deleteResult = yield ProjectDescription_1.default.deleteMany({
                _id: { $in: oldRequests.map((req) => req._id) },
            });
            console.log(`\n✅ Successfully deleted ${deleteResult.deletedCount} old project requests`);
        }
        else {
            console.log("✅ No old project requests found. All requests have the new structure.");
        }
        // Show remaining requests with new structure
        const remainingRequests = yield ProjectDescription_1.default.find({});
        console.log(`\n📊 Remaining project requests: ${remainingRequests.length}`);
        if (remainingRequests.length > 0) {
            console.log("\nRemaining requests (new structure):");
            remainingRequests.forEach((request, index) => {
                var _a;
                console.log(`${index + 1}. ${request.name} - ${request.serviceType}`);
                console.log(`   Services: ${((_a = request.selectedServices) === null || _a === void 0 ? void 0 : _a.length) || 0} selected`);
            });
        }
    }
    catch (error) {
        console.error("Error cleaning old project requests:", error);
    }
    finally {
        yield mongoose_1.default.connection.close();
        console.log("\nDatabase connection closed");
        process.exit(0);
    }
});
// Run the script
cleanOldProjectRequests();
